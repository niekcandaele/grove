# ai-env-manager

CLI tool for managing git worktrees with automatic port allocation, designed for running multiple AI coding agents on the same project simultaneously.

## Problem

When running multiple AI agents (Claude Code, Aider, Cursor, etc.) on the same codebase, you need isolated workspaces. Git worktrees provide this, but introduce new problems:

- **Port conflicts**: Multiple worktrees running the same app compete for ports
- **Manual setup**: Each worktree needs `.env` files copied and ports adjusted
- **Docker complexity**: Port mappings in `docker-compose.yml` are tracked by git

This tool solves all three.

## Installation

**Requirements:**
- Node.js 20+
- Git
- Docker Compose 2.24.4+ (optional, for Docker integration)

```bash
# Run directly with npx
npx ai-env-manager create my-feature

# Or install globally
npm install -g ai-env-manager
ai-env create my-feature
```

## Quick Start

```bash
# In your project root
ai-env create feature-auth
# Creates worktree, allocates ports, configures .env

# Switch to the new environment
eval "$(ai-env activate feature-auth)"

# See all environments
ai-env list

# Check status
ai-env status

# Clean up when done
ai-env delete feature-auth --delete-branch
```

## Commands

### create

Create a new environment with git worktree and automatic port allocation.

```bash
ai-env create <name> [--verbose]
```

- Creates git branch and worktree
- Copies `.env.example` to `.env`
- Allocates unique ports for all `*_PORT` variables
- Generates Docker Compose override (if configured)

### activate

Output shell command to change to worktree directory.

```bash
eval "$(ai-env activate <name>)"
```

### list

Show all environments for the current project.

```bash
ai-env list [--verbose]
```

### delete

Remove an environment and release its ports.

```bash
ai-env delete <name> [--force] [--delete-branch] [--verbose]
```

### status

Show project summary and port usage.

```bash
ai-env status [--verbose]
```

## Configuration

### Project Config (`.ai-env.json`)

Create this file in your project root:

```json
{
  "worktreeDir": "../my-project-worktrees",
  "baseBranch": "main",
  "portVarPatterns": ["*_PORT"],
  "portRange": [30000, 39999],
  "portMapping": {
    "HTTP_PORT": { "service": "web", "containerPort": 80 },
    "DB_PORT": { "service": "postgres", "containerPort": 5432 }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `worktreeDir` | `../<project>-worktrees` | Where to create worktrees |
| `baseBranch` | `main` | Branch to create new branches from |
| `portVarPatterns` | `["*_PORT"]` | Glob patterns for port variables in `.env` |
| `portRange` | `[30000, 39999]` | Port allocation range |
| `portMapping` | `{}` | Docker service port mappings |

### Port Mapping Formats

**Object format** (recommended):

```json
{
  "portMapping": {
    "HTTP_PORT": { "service": "web", "containerPort": 80 }
  }
}
```

**String format** (uses default container ports):

```json
{
  "portMapping": {
    "HTTP_PORT": "web"
  }
}
```

Default container ports: HTTP/API → 3000, DB/POSTGRES → 5432, REDIS → 6379, etc.

### Global Config (`~/.config/ai-env-manager/config.json`)

```json
{
  "defaultPortRange": [30000, 39999],
  "defaultBaseBranch": "main"
}
```

## Docker Compose Integration

When `portMapping` is configured and `docker-compose.yml` exists, the tool:

1. Generates an override file **outside** the repository
2. Sets `COMPOSE_FILE` in `.env` to point to both files
3. Uses `!override` tag to replace port arrays (not append)

**Example:**

Your `docker-compose.yml`:
```yaml
services:
  web:
    image: nginx
    ports:
      - "80:80"
```

Generated override (stored outside repo):
```yaml
services:
  web:
    ports: !override
      - "30001:80"
```

Result: Port 30001 maps to container port 80, no git changes.

**Requirements:**
- Docker Compose 2.24.4+ (for `!override` tag support)
- For older versions, use env variables in your compose file: `${HTTP_PORT:-8080}:80`

## File Locations

| File | Location |
|------|----------|
| Global config | `~/.config/ai-env-manager/config.json` |
| Port registry | `~/.local/state/ai-env-manager/ports.json` |
| Docker overrides | `~/.local/state/ai-env-manager/overrides/<hash>/<env>/` |

## Examples

### Basic Project (no Docker)

```bash
# Project has .env.example with HTTP_PORT=3000
ai-env create feature-login

# Output:
# Creating worktree...
#   Branch: feature-login
#   Path: /home/user/my-app-worktrees/feature-login
#   Copied .env file
# Allocating ports...
#   HTTP_PORT=30000
#
# Environment "feature-login" created successfully!
#
# To activate:
#   eval "$(ai-env activate feature-login)"
```

### Project with Docker Compose

`.ai-env.json`:
```json
{
  "portMapping": {
    "HTTP_PORT": { "service": "app", "containerPort": 3000 },
    "DB_PORT": { "service": "postgres", "containerPort": 5432 }
  }
}
```

```bash
ai-env create feature-api

# Also outputs:
# Configuring Docker Compose...
#   Override: ~/.local/state/ai-env-manager/overrides/.../docker-compose.override.yml
#   COMPOSE_FILE set in .env
```

In the worktree, `docker compose up` uses the allocated ports automatically.

### Multiple Environments

```bash
ai-env create agent-1
ai-env create agent-2
ai-env create agent-3

ai-env list
# Environments (3):
#
#   NAME      PATH                                    PORTS
#   ───────   ─────────────────────────────────────   ────────────────────
#   agent-1   /home/user/my-app-worktrees/agent-1     HTTP:30000 DB:30001
#   agent-2   /home/user/my-app-worktrees/agent-2     HTTP:30002 DB:30003
#   agent-3   /home/user/my-app-worktrees/agent-3     HTTP:30004 DB:30005
```

## Troubleshooting

### "Error: Not in a git repository"

Run the command from within a git repository.

### Environment not found

Check available environments with `ai-env list`.

### Docker Compose shows two port mappings

Your Docker Compose version is too old. Upgrade to 2.24.4+ or use environment variables in your compose file:

```yaml
ports:
  - "${HTTP_PORT:-8080}:80"
```

### Port conflict

Ports are allocated globally across all projects. If you're running low on ports, check usage with `ai-env status` and delete unused environments.

### Worktree already exists

An environment with that name already exists. Use a different name or delete the existing one first.

## License

MIT
