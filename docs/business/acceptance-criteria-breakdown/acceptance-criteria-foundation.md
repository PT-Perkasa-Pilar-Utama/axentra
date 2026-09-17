# Acceptance Criteria - Foundation

Foundation acceptance criteria are technical implementation criteria created for Axentra
Foundation v0.1.0. They are not part of the BA workbook.

## AC-FND-01 - Workspace and Process Boundaries Exist

```gherkin
Given the repository is checked out
When a developer inspects the workspace
Then the repository contains separate Web, API, and Worker apps
And shared infrastructure packages are under packages
```

## AC-FND-02 - Health Endpoint Returns Liveness

```gherkin
Given the API process is running
When a client calls GET /api/v1/health
Then the response status is 200
And the response contains service, version, and status ok
```

## AC-FND-03 - Readiness Endpoint Checks Dependencies

```gherkin
Given the API process is running
When a client calls GET /api/v1/health/ready
Then the API checks PostgreSQL, Redis, and Storage
And the response status is 200 when all dependencies are ready
And the response status is 503 when at least one dependency is unavailable
```

## AC-FND-04 - Worker Starts and Shuts Down Safely

```gherkin
Given the Worker process starts
When configuration and dependencies are valid
Then it accepts queue work
And when a shutdown signal is received
Then it stops new jobs and closes clients within the configured timeout
```

## AC-FND-05 - Local Infrastructure Runs Through Docker Compose

```gherkin
Given Docker Desktop is running
When a developer runs bun run infra:up
Then PostgreSQL, Redis, and MinIO start with health checks
And the local ports match .env.example
```

## AC-FND-06 - Quality Gates Pass

```gherkin
Given dependencies are installed
When a developer runs bun run complete-check
Then type-check, lint, format check, unit tests, and builds pass
```
