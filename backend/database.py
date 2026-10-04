from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./expense_tracker.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db():
    SQLModel.metadata.create_all(engine)
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
