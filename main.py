"""
Ride-Hailing Dashboard — FastAPI Backend
=========================================
Install:
    pip install fastapi uvicorn psycopg2-binary python-dotenv

Run:
    uvicorn main:app --reload --port 8000

.env (create this file alongside main.py):
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=ride_hailing_db
    DB_USER=postgres
    DB_PASSWORD=your_password
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# DB connection helper
# ---------------------------------------------------------------------------
def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode="require"
    )


def query(sql: str, params=None):
    """Execute a SELECT and return a list of dicts."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Ride-Hailing Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# KPI — Summary cards
# ---------------------------------------------------------------------------
@app.get("/api/kpi")
def get_kpi():
    """Top-level KPI cards for the dashboard."""
    rows = query("""
        SELECT
            COUNT(*)                                        AS total_trips,
            COUNT(*) FILTER (WHERE status = 'completed')   AS completed_trips,
            COUNT(*) FILTER (WHERE status = 'in_progress') AS active_trips,
            COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled_trips,
            ROUND(COALESCE(SUM(fare_ngn) FILTER (WHERE status = 'completed'), 0), 2)
                                                            AS total_revenue_ngn,
            ROUND(COALESCE(AVG(fare_ngn) FILTER (WHERE status = 'completed'), 0), 2)
                                                            AS avg_fare_ngn,
            ROUND(COALESCE(AVG(distance_km) FILTER (WHERE status = 'completed'), 0), 2)
                                                            AS avg_distance_km
        FROM public.trips
    """)

    drivers = query("""
        SELECT
            COUNT(*)                             AS total_drivers,
            COUNT(*) FILTER (WHERE is_available) AS available_drivers,
            ROUND(COALESCE(AVG(rating), 0), 2)   AS avg_driver_rating
        FROM public.drivers
    """)

    riders = query("SELECT COUNT(*) AS total_riders FROM public.riders")

    payments = query("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending')              AS pending_payments,
            ROUND(COALESCE(SUM(amount_ngn) FILTER (WHERE status = 'completed'), 0), 2)
                                                                     AS total_payments_processed
        FROM public.payments
    """)

    return {**rows[0], **drivers[0], **riders[0], **payments[0]}


# ---------------------------------------------------------------------------
# Trips by status (pie / donut)
# ---------------------------------------------------------------------------
@app.get("/api/trips/by-status")
def trips_by_status():
    return query("""
        SELECT status, COUNT(*) AS count
        FROM public.trips
        GROUP BY status
        ORDER BY count DESC
    """)


# ---------------------------------------------------------------------------
# Monthly revenue + trip count (line / bar chart)
# ---------------------------------------------------------------------------
@app.get("/api/trips/monthly")
def monthly_stats():
    return query("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', t.created_at), 'Mon YYYY') AS month,
            DATE_TRUNC('month', t.created_at)                       AS month_ts,
            COUNT(t.trip_id)                                        AS total_trips,
            COUNT(t.trip_id) FILTER (WHERE t.status = 'completed')  AS completed_trips,
            ROUND(COALESCE(SUM(p.amount_ngn), 0), 2)                AS revenue_ngn
        FROM public.trips t
        LEFT JOIN public.payments p
               ON p.trip_id = t.trip_id
              AND p.trip_created_at = t.created_at
              AND p.status = 'completed'
        GROUP BY DATE_TRUNC('month', t.created_at)
        ORDER BY month_ts
    """)


# ---------------------------------------------------------------------------
# Top drivers by earnings
# ---------------------------------------------------------------------------
@app.get("/api/drivers/top")
def top_drivers(limit: int = Query(10, ge=1, le=50)):
    return query("""
        SELECT
            u.full_name,
            d.vehicle_type,
            d.license_plate,
            d.rating,
            d.is_available,
            COUNT(t.trip_id) FILTER (WHERE t.status = 'completed')          AS completed_trips,
            ROUND(COALESCE(SUM(p.amount_ngn), 0), 2)                         AS total_earnings_ngn
        FROM public.drivers d
        JOIN public.users u     ON u.user_id   = d.user_id
        LEFT JOIN public.trips t
               ON t.driver_id  = d.driver_id
              AND t.status      = 'completed'
        LEFT JOIN public.payments p
               ON p.trip_id    = t.trip_id
              AND p.trip_created_at = t.created_at
        GROUP BY d.driver_id, u.full_name, d.vehicle_type, d.license_plate,
                 d.rating, d.is_available
        ORDER BY total_earnings_ngn DESC
        LIMIT %s
    """, (limit,))


# ---------------------------------------------------------------------------
# Payment method breakdown
# ---------------------------------------------------------------------------
@app.get("/api/payments/methods")
def payment_methods():
    return query("""
        SELECT
            payment_method,
            COUNT(*)                    AS count,
            ROUND(SUM(amount_ngn), 2)   AS total_ngn
        FROM public.payments
        WHERE status = 'completed'
        GROUP BY payment_method
        ORDER BY total_ngn DESC
    """)


# ---------------------------------------------------------------------------
# Vehicle type breakdown
# ---------------------------------------------------------------------------
@app.get("/api/drivers/vehicle-types")
def vehicle_types():
    return query("""
        SELECT
            vehicle_type,
            COUNT(*)   AS driver_count,
            ROUND(AVG(rating), 2) AS avg_rating
        FROM public.drivers
        GROUP BY vehicle_type
        ORDER BY driver_count DESC
    """)


# ---------------------------------------------------------------------------
# Recent trips feed
# ---------------------------------------------------------------------------
@app.get("/api/trips/recent")
def recent_trips(limit: int = Query(15, ge=1, le=100)):
    return query("""
        SELECT
            t.trip_id,
            t.status,
            t.fare_ngn,
            t.distance_km,
            t.created_at,
            u_r.full_name  AS rider_name,
            u_d.full_name  AS driver_name,
            d.vehicle_type
        FROM public.trips t
        JOIN public.riders ri   ON ri.rider_id   = t.rider_id
        JOIN public.users  u_r  ON u_r.user_id   = ri.user_id
        LEFT JOIN public.drivers d    ON d.driver_id   = t.driver_id
        LEFT JOIN public.users  u_d   ON u_d.user_id   = d.user_id
        ORDER BY t.created_at DESC
        LIMIT %s
    """, (limit,))


# ---------------------------------------------------------------------------
# Ratings distribution
# ---------------------------------------------------------------------------
@app.get("/api/ratings/distribution")
def ratings_distribution():
    return query("""
        SELECT
            rating_value,
            COUNT(*) AS count
        FROM public.ratings
        GROUP BY rating_value
        ORDER BY rating_value
    """)


# ---------------------------------------------------------------------------
# Driver availability summary
# ---------------------------------------------------------------------------
@app.get("/api/drivers/availability")
def driver_availability():
    return query("""
        SELECT
            is_available,
            COUNT(*) AS count
        FROM public.drivers
        GROUP BY is_available
    """)


# ---------------------------------------------------------------------------
# Audit log (latest)
# ---------------------------------------------------------------------------
@app.get("/api/audit-logs")
def audit_logs(limit: int = Query(20, ge=1, le=100)):
    return query("""
        SELECT
            al.log_id,
            al.table_name,
            al.record_id,
            al.action,
            al.changed_at,
            u.full_name AS changed_by
        FROM public.audit_logs al
        LEFT JOIN public.users u ON u.user_id = al.changed_by
        ORDER BY al.changed_at DESC
        LIMIT %s
    """, (limit,))


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    try:
        query("SELECT 1")
        return {"status": "ok", "db": "connected", "timestamp": datetime.utcnow()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))