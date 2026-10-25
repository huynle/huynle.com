---
title: "Hindsight"
status: active
summary: "Hindsight is my trading research platform. It takes a strategy from idea to backtest to validation, and only then to execution against a broker."
links: []
updated: 2026-10-23
brainId: "4bj5n4z2"
---

Strategies are written in Python or in HSL, a small rule language I added so that both agents and I can write strategies that are checked before they run. Backtests run in a Rust engine: Python precomputes the signals, and Rust runs the bar-by-bar loop.

Validation is the point of the project. A strategy has to pass walk-forward, robustness, Monte Carlo and permutation tests before it can be promoted, and the bar for promotion is defined in one place with no override. The interface should never show more confidence than the evidence supports.

Promoted strategies become trade plans that run against a broker. For now everything trades on a paper account while I harden that path in a long-running soak test. The stack is Python (FastAPI, SQLAlchemy), Postgres plus DuckDB over Parquet for market data, the Rust engine, and a server-rendered htmx web app.
