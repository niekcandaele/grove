# grove

CLI tool for managing git worktrees with automatic port allocation, designed for running multiple AI coding agents on the same project simultaneously.

## Problem

When running multiple AI agents (Claude Code, Aider, Cursor, etc.) on the same codebase, you need isolated workspaces. Git worktrees provide this, but introduce new problems:

- **Port conflicts**: Multiple worktrees running the same app compete for ports
- **Manual setup**: Each worktree needs `.env` files copied and ports adjusted
- **Docker complexity**: Port mappings in `docker-compose.yml` are tracked by git

This tool solves all three.

## Installation

### Standalone Binary

Download from [releases](https://github.com/niekcandaele/grove/releases) and add to your PATH:

```bash
curl -LO https://github.com/niekcandaele/grove/releases/latest/download/grove-linux-x64
chmod +x grove-linux-x64
sudo mv grove-linux-x64 /usr/local/bin/grove
```

Binaries available for Linux, macOS, and Windows (x64 and arm64).

### Requirements

- Git
- Docker Compose 2.24.4+ (optional)

## Quick Start

```bash
# In your project root
grove create feature-auth
# Creates worktree, allocates ports, configures .env

# Switch to the new environment
eval "$(grove activate feature-auth)"

# See all environments
grove list

# Check status
grove status

# Clean up when done
grove delete feature-auth --delete-branch
```

## Commands

### create

Create a new environment with git worktree and automatic port allocation.

```bash
grove create <name> [--verbose]
```

- Creates git branch and worktree
- Copies `.env.example` to `.env`
- Allocates unique ports for all `*_PORT` variables
- Generates Docker Compose override (if configured)

### activate

Output shell command to change to worktree directory.

```bash
eval "$(grove activate <name>)"
```

### list

Show all environments for the current project.

```bash
grove list [--verbose]
```

### delete

Remove an environment and release its ports.

```bash
grove delete <name> [--force] [--delete-branch] [--verbose]
```

### status

Show project summary and port usage.

```bash
grove status [--verbose]
```

## Configuration

### Project Config (`.grove.json`)

Create this file in your project root:

```json
{
  "worktreeDir": "../my-project-worktrees",
  "baseBranch": "main",
  "portVarPatterns": ["*_PORT"],
  "portRange": [30000, 39999],
  "copyFiles": [".envrc"]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `worktreeDir` | `../<project>-worktrees` | Where to create worktrees |
| `baseBranch` | `main` | Branch to create new branches from |
| `portVarPatterns` | `["*_PORT"]` | Glob patterns for port variables in `.env` |
| `portRange` | `[30000, 39999]` | Port allocation range |
| `copyFiles` | `[]` | Files to copy from main worktree to new worktrees |

### Global Config (`~/.config/grove/config.json`)

```json
{
  "defaultPortRange": [30000, 39999],
  "defaultBaseBranch": "main"
}
```

## Docker Compose Integration

Grove allocates ports and updates your `.env` file. To use these ports with Docker Compose, use environment variable syntax in your `docker-compose.yml`:

```yaml
services:
  web:
    image: nginx
    ports:
      - "${HTTP_PORT:-8080}:80"
  postgres:
    image: postgres
    ports:
      - "${DB_PORT:-5432}:5432"
```

When Grove creates a worktree, it allocates unique ports (e.g., `HTTP_PORT=30001`) in the `.env` file. Docker Compose reads these automatically.

**Setup:**

1. Add port variables to `.env.example`:
   ```
   HTTP_PORT=8080
   DB_PORT=5432
   ```

2. Use variable syntax in `docker-compose.yml`:
   ```yaml
   ports:
     - "${HTTP_PORT:-8080}:80"
   ```

The `:-8080` provides a default value for when `.env` doesn't exist.

## Zellij Integration

Grove automatically integrates with [Zellij](https://zellij.dev/) when running inside a Zellij session. Each worktree gets its own tab.

**Inside a Zellij session:**
- `grove create <name>` creates the worktree and opens a new tab
- `grove activate <name>` switches to the worktree's tab

**Outside a Zellij session:**
- `grove activate <name>` attaches to (or creates) the project's Zellij session
- Run `grove activate` again once inside to switch to the tab

Session names are derived from the project directory (e.g., `my-app` for `/home/user/code/my-app`).

## File Locations

| File | Location |
|------|----------|
| Global config | `~/.config/grove/config.json` |
| Port registry | `~/.local/state/grove/ports.json` |

## Examples

### Basic Project (no Docker)

```bash
# Project has .env.example with HTTP_PORT=3000
grove create feature-login

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
#   eval "$(grove activate feature-login)"
```

### Project with Docker Compose

`.env.example`:
```bash
HTTP_PORT=3000
DB_PORT=5432
```

`docker-compose.yml`:
```yaml
services:
  app:
    ports:
      - "${HTTP_PORT:-3000}:3000"
  postgres:
    ports:
      - "${DB_PORT:-5432}:5432"
```

```bash
grove create feature-api

# Output:
# Creating worktree...
#   Branch: feature-api
#   Path: /home/user/my-app-worktrees/feature-api
#   Copied .env file
# Allocating ports...
#   HTTP_PORT=30000
#   DB_PORT=30001
#
# Environment "feature-api" created successfully!
```

In the worktree, `docker compose up` uses the allocated ports automatically.

### Multiple Environments

```bash
grove create agent-1
grove create agent-2
grove create agent-3

grove list
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

Check available environments with `grove list`.

### Port conflict

Ports are allocated globally across all projects. If you're running low on ports, check usage with `grove status` and delete unused environments.

### Worktree already exists

An environment with that name already exists. Use a different name or delete the existing one first.

## License

MIT
