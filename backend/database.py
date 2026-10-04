import os

from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
if not DATABASE_URL:
    if os.environ.get("VERCEL"):
        # Vercel's serverless filesystem doesn't persist across invocations/cold
        # starts, so a silent SQLite fallback here means every import looks like
        # it worked and then vanishes on the next request. Fail loudly instead.
        raise RuntimeError(
            "DATABASE_URL/POSTGRES_URL is not set. On Vercel, SQLite writes don't "
            "survive between requests, so data would silently disappear. Add a "
            "Postgres database (Vercel dashboard -> Storage -> Postgres, or the "
            "Neon integration) to this project so DATABASE_URL gets set."
        )
    DATABASE_URL = "sqlite:///./expense_tracker.db"
# Neon/Vercel hand out "postgres://" or "postgresql://"; SQLAlchemy needs the psycopg dialect spelled out.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if IS_SQLITE else {})


def init_db():
    SQLModel.metadata.create_all(engine)
    if IS_SQLITE:
        _migrate_add_user_id()


def _migrate_add_user_id():
    # ponytail: create_all() skips tables that already exist, so a pre-auth
    # expense_tracker.db never gets this column and every query 500s. Add it
    # by hand if missing; old rows land with user_id=NULL (invisible to every
    # account, not deleted) — a real backfill would assign them by hand.
    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(expense)")}
        if cols and "user_id" not in cols:
            conn.exec_driver_sql("ALTER TABLE expense ADD COLUMN user_id INTEGER")
            conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
