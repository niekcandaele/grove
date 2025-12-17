# Design: AI Environment Manager

A CLI tool for managing git worktrees with automatic port allocation, designed for running multiple AI coding agents on the same project simultaneously.

---

## Layer 1: Problem & Requirements

### Problem Statement

Developers using AI coding agents (Claude Code, Aider, Cursor, etc.) often need to run multiple agents on the same codebase simultaneously [1]. Git worktrees solve the isolated workspace problem, but introduce new friction:

1. **Port conflicts**: Multiple worktrees running the same application compete for the same ports, causing startup failures or silent misbehavior
2. **Manual setup overhead**: Each worktree requires copying `.env` files and adjusting ports
3. **Docker Compose complexity**: Port mappings in `docker-compose.yml` are tracked by git, making worktree-specific changes problematic

These problems compound when managing 10+ parallel AI agent sessions, which is increasingly common for large refactoring tasks or feature development [2].

### Current State

**Without this tool**, developers must:
1. Manually run `git worktree add` with correct paths
2. Copy `.env.example` to `.env` and manually edit port numbers
3. Either modify `docker-compose.yml` (polluting git status) or remember to use `-p` flags
4. Track which ports are "in use" mentally or in notes

Pain points:
- Forgetting which ports are assigned to which worktree
- AI agents accidentally committing port changes in `docker-compose.yml`
- Time spent on repetitive setup instead of actual development
- No central view of all active environments

### Requirements

#### Functional

- **REQ-001**: The system SHALL create git worktrees with associated git branches using a single command
- **REQ-002**: WHEN creating a worktree, the system SHALL copy `.env.example` to `.env` and assign unique ports to all `*_PORT` variables
- **REQ-003**: The system SHALL maintain a global registry of port assignments to prevent conflicts across all projects
- **REQ-004**: WHEN a project uses Docker Compose with explicit port mappings configured, the system SHALL generate `docker-compose.override.yml` with port mappings (never modifying the main compose file)
- **REQ-005**: The system SHALL support both per-project configuration (`.ai-env.json`) and global user configuration
- **REQ-006**: The system SHALL sanitize user-provided names to be valid for both git branches and filesystem paths
- **REQ-007**: The system SHALL list all worktrees for the current project with their status and port assignments
- **REQ-008**: The system SHALL cleanly delete worktrees, their branches, and release port allocations
- **REQ-009**: WHEN a worktree is deleted, its ports SHALL be immediately available for reuse

#### Non-Functional

- **Performance**: Commands SHALL complete in under 2 seconds for typical operations (excluding `git` and network operations) [3]
- **Reliability**: Port assignments SHALL be persisted to disk after each operation
- **Usability**: CLI SHALL provide clear error messages with actionable remediation steps
- **Compatibility**: SHALL work on Linux and macOS with Node.js 20+ [4]

### Constraints

- Must not require elevated permissions (no system-level port management)
- Must work with existing git repositories without modification
- Port range limited to unprivileged ports (1024-65535), defaulting to 30000-39999 to avoid common development ports

### Success Criteria

1. Developer can create a new AI agent environment in under 10 seconds
2. Zero port conflicts between worktrees across all projects
3. No manual port editing required
4. `docker-compose.yml` never appears in `git status` due to port changes

---

## Layer 2: Functional Specification

### User Workflows

#### 1. Create New Environment

```
User runs: ai-env create feature-auth

System actions:
1. Sanitize name → "feature-auth"
2. Create git branch "feature-auth" from base branch
3. Create worktree at configured location
4. Copy .env.example → .env
5. Scan .env for *_PORT variables
6. Allocate unique ports from global registry
7. Update .env with allocated ports
8. If docker-compose.yml exists AND portMapping configured:
   - Generate docker-compose.override.yml OUTSIDE repo
   - Add COMPOSE_FILE env var to .env pointing to both files
9. Output summary with port assignments and worktree path
10. Output activation command (auto-activate)
```

#### 2. Activate Environment

```
User runs: eval "$(ai-env activate feature-auth)"

System outputs (to stdout for eval):
cd /path/to/worktrees/feature-auth
```

The shell evaluates this, changing the current directory.

#### 3. List Environments

```
User runs: ai-env list

System outputs:
┌─────────────────┬────────────┬─────────────────────┐
│ Name            │ Branch     │ Ports               │
├─────────────────┼────────────┼─────────────────────┤
│ feature-auth    │ feature-   │ HTTP:30001 DB:30002 │
│                 │ auth       │                     │
│ bugfix-login    │ bugfix-    │ HTTP:30003 DB:30004 │
│                 │ login      │                     │
│ refactor-api    │ refactor-  │ HTTP:30005 DB:30006 │
│                 │ api        │                     │
└─────────────────┴────────────┴─────────────────────┘
```

#### 4. Delete Environment

```
User runs: ai-env delete feature-auth

System actions:
1. Confirm with user (unless --force)
2. Remove worktree directory
3. Optionally delete git branch (prompt or --delete-branch)
4. Release ports from registry (immediately available for reuse)
5. Output confirmation
```

#### 5. Show Status

```
User runs: ai-env status

System outputs:
Project: my-app
Base branch: main
Worktree directory: ../my-app-worktrees/

Environments: 3 active
Ports in use: 30001-30006 (6 ports)

Global registry: 47 ports in use across 5 projects
```

### External Interfaces

#### CLI Interface

```
ai-env <command> [options]

Commands:
  create <name>    Create new environment (auto-activates)
  activate <name>  CD into worktree (use: eval "$(ai-env activate <name>)")
  list             List all environments
  delete <name>    Delete environment
  status           Show project status

Global Options:
  --help, -h       Show help
  --version, -v    Show version
  --verbose        Show detailed output
```

**Activate pattern**: Since subprocesses cannot change the parent shell's directory, `activate` outputs shell commands for eval:
```bash
eval "$(ai-env activate feature-auth)"
```

#### Configuration Files

**Project config** (`.ai-env.json`):
```json
{
  "worktreeDir": "../my-project-worktrees",
  "baseBranch": "main",
  "portVarPatterns": ["*_PORT", "*_port"],
  "portMapping": {
    "HTTP_PORT": { "service": "web", "containerPort": 80 },
    "DB_PORT": { "service": "postgres", "containerPort": 5432 },
    "REDIS_PORT": "redis"
  }
}
```

The `portMapping` config maps environment variable names to Docker service names. Two formats are supported:
- **Object format** (recommended): `{ "service": "name", "containerPort": 80 }` - explicitly specifies the container port
- **String format** (legacy): `"service-name"` - uses heuristic-based container port defaults (HTTP→3000, DB→5432, etc.)

> **Note**: Requires Docker Compose 2.24.4+ for `!override` tag support. For older versions, base docker-compose.yml should use environment variable syntax (`${HTTP_PORT:-8080}:80`) instead of hardcoded host ports.

> **Decision**: Docker Compose port mapping requires explicit configuration
> **Rationale**: Auto-detection via `${VAR_NAME}` scanning adds complexity and can be unreliable. Explicit mapping is clearer and more maintainable.
> **Alternative**: Auto-scanning was rejected due to complexity and edge cases

**Global config** (`~/.config/ai-env-manager/config.json`):
```json
{
  "defaultPortRange": [30000, 39999],
  "defaultBaseBranch": "main"
}
```

**Port registry** (`~/.local/state/ai-env-manager/ports.json`):
```json
{
  "version": 1,
  "allocations": {
    "30001": {
      "project": "/home/user/code/my-app",
      "environment": "feature-auth",
      "varName": "HTTP_PORT",
      "allocatedAt": "2025-01-15T10:30:00Z"
    },
    "30002": {
      "project": "/home/user/code/my-app",
      "environment": "feature-auth",
      "varName": "DB_PORT",
      "allocatedAt": "2025-01-15T10:30:00Z"
    }
  }
}
```

> **Decision**: Shared global port pool instead of per-project blocks
> **Rationale**: Provides flexibility across projects without artificial limits. Ports are allocated sequentially from the global pool.
> **Alternative**: Fixed 100-port blocks per project was rejected as too limiting

### Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| Per-project port blocks | Predictable ranges | Limited to 100 ports per project | Arbitrary limits cause issues at scale |
| Random port allocation | No central registry needed | Can't predict ports, harder to debug | Predictability aids debugging |
| Modify docker-compose.yml | Direct port control | Shows in git status, AI agents may commit | Defeats purpose of clean worktrees [5] |
| Auto-detect Docker port mapping | Less config | Unreliable, complex edge cases | Explicit config is clearer |
| TOML for config | Better for humans [6] | JSON more universal in Node.js ecosystem | Ecosystem alignment with Citty/UnJS |

---

## Layer 3: Technical Specification

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Entry Point                         │
│                        (src/index.ts)                           │
│                           Citty                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌───────────┐   ┌───────────┐   ┌───────────┐
        │  Commands │   │  Commands │   │  Commands │
        │  create   │   │   list    │   │  status   │
        │  delete   │   │           │   │           │
        └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────────┐
        │                     Services Layer                       │
        ├─────────────────┬─────────────────┬─────────────────────┤
        │    Git          │    Ports        │     Env             │
        │  Service        │   Service       │   Service           │
        │                 │                 │                     │
        │ - worktree      │ - registry      │ - copy .env         │
        │   create        │   read/write    │ - scan vars         │
        │ - branch        │ - allocate      │ - update ports      │
        │   create        │ - release       │ - docker override   │
        │ - list          │                 │                     │
        └─────────────────┴─────────────────┴─────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────────┐
        │                    Config Layer                          │
        ├─────────────────────────┬───────────────────────────────┤
        │     Project Config      │       Global Config           │
        │    (.ai-env.json)       │  (~/.config/ai-env-manager/)  │
        └─────────────────────────┴───────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────────┐
        │                    Utils Layer                           │
        ├─────────────────────────┬───────────────────────────────┤
        │   Name Sanitization     │      Path Resolution          │
        │   (naming.ts)           │      (paths.ts)               │
        └─────────────────────────┴───────────────────────────────┘
```

### Code Change Analysis

Since this is a new project, all components are created:

| Component | Action | Justification |
|-----------|--------|---------------|
| `src/index.ts` | Create | CLI entry point using Citty [7] |
| `src/commands/*.ts` | Create | Command implementations (create, activate, list, delete, status) |
| `src/services/git.ts` | Create | Git operations via child_process |
| `src/services/ports.ts` | Create | Global port registry with file locking |
| `src/services/env.ts` | Create | .env file parsing, modification, Docker override |
| `src/config/*.ts` | Create | Config loading with XDG compliance [8] |
| `src/utils/*.ts` | Create | Shared utilities |

### Implementation Approach

#### CLI Entry Point (`src/index.ts`)

Uses Citty's defineCommand pattern [7]:

```
define main command with subcommands
  - meta: name, version, description
  - subCommands: create, list, delete, status

run main command
```

#### Git Service (`src/services/git.ts`)

```
createWorktree(name, baseBranch, targetDir):
  if branch exists:
    create worktree from existing branch
  else:
    create branch from baseBranch
    create worktree from new branch

listWorktrees(projectRoot):
  parse output of "git worktree list --porcelain"
  return structured worktree info

removeWorktree(path, deleteBranch):
  run "git worktree remove <path>"
  if deleteBranch:
    run "git branch -d <branch>"
```

#### Port Service (`src/services/ports.ts`)

```
allocatePorts(projectPath, envName, varNames):
  read registry from disk

  allocatedPorts = {}
  for each varName:
    find next available port in range [30000, 39999]
    record allocation: port -> {project, env, varName, timestamp}
    allocatedPorts[varName] = port

  write registry to disk
  return allocatedPorts

releasePorts(projectPath, envName):
  read registry
  remove all allocations matching project + envName
  write registry
```

> **Decision**: No file locking for registry access
> **Rationale**: Concurrent CLI invocations are rare in practice. Users typically run one `ai-env create` at a time. Adding file locking increases complexity without proportional benefit. Can be added later if race conditions become a real problem.

> **Decision**: Ports immediately available for reuse after deletion
> **Rationale**: Maximizes port space efficiency. Users can track their own port assignments via `ai-env list` if needed.

Port allocation strategy:
- Global shared pool in range 30000-39999
- Sequential allocation: find first unused port
- Immediate release on delete (no reservation period)

#### Environment Service (`src/services/env.ts`)

```
copyAndConfigureEnv(worktreePath, portMap):
  if .env.example exists:
    copy to .env
  else if .env exists in main worktree:
    copy from main

  read .env content
  for each key matching *_PORT pattern:
    if key in portMap:
      update value

  write .env

generateDockerOverride(worktreePath, portMap, portMapping, projectHash, envName):
  if no portMapping configured:
    return (skip Docker override)

  parse docker-compose.yml

  services = {}
  for each varName, port in portMap:
    if varName in portMapping:
      serviceName = portMapping[varName]
      containerPort = get from compose or use common defaults
      services[serviceName] = {ports: ["<port>:<containerPort>"]}

  # Store override OUTSIDE repo to prevent AI agents from committing it
  overridePath = ~/.local/state/ai-env-manager/overrides/<projectHash>/<envName>/docker-compose.override.yml
  write override file to overridePath

  # Add COMPOSE_FILE to .env so docker compose finds both files
  append to .env:
    COMPOSE_FILE=docker-compose.yml:<overridePath>
```

> **Decision**: Only copy `.env.example` → `.env`, no configurable file patterns
> **Rationale**: Keeps scope focused. Other file copying can be handled by git worktree itself or post-create hooks in future versions.

#### Config Loading (`src/config/`)

Following XDG Base Directory Specification [8]:

```
loadGlobalConfig():
  configPath = $XDG_CONFIG_HOME/ai-env-manager/config.json
             or ~/.config/ai-env-manager/config.json

  if file exists:
    return parse JSON
  return defaults

loadProjectConfig(projectRoot):
  configPath = projectRoot/.ai-env.json

  if file exists:
    return merge with global config
  return global config

getStatePath():
  return $XDG_STATE_HOME/ai-env-manager/
       or ~/.local/state/ai-env-manager/
```

#### Name Sanitization (`src/utils/naming.ts`)

```
sanitizeName(input):
  replace spaces with hyphens
  remove characters invalid for git branches: ~ ^ : ? * [ \
  remove characters invalid for filesystems: / \ : * ? " < > |
  collapse multiple hyphens
  trim leading/trailing hyphens

  if result empty:
    throw error

  return lowercase result
```

### Data Models

#### Port Registry Schema

```typescript
interface PortRegistry {
  version: 1;
  allocations: Record<string, PortAllocation>;  // port number -> allocation
}

interface PortAllocation {
  project: string;      // absolute path
  environment: string;  // worktree/env name
  varName: string;      // e.g., "HTTP_PORT"
  allocatedAt: string;  // ISO 8601
}
```

#### Project Config Schema

```typescript
interface ProjectConfig {
  worktreeDir?: string;
  baseBranch?: string;
  portVarPatterns?: string[];
  portMapping?: Record<string, string>;  // VAR_NAME -> docker service name
}
```

### Security

- **File permissions**: Registry and config files created with 0600 permissions
- **Input validation**: All user input sanitized before use in shell commands
- **No secrets**: Tool never reads or logs actual .env values, only variable names
- **Path traversal**: Worktree paths validated to be within expected directories

### Test-Driven Implementation

#### Unit Tests

- `naming.test.ts`: Sanitization edge cases (spaces, special chars, unicode)
- `ports.test.ts`: Allocation, release, immediate reuse
- `config.test.ts`: Merging, defaults, XDG path resolution
- `env.test.ts`: .env parsing, PORT pattern matching

#### Integration Tests

- Create worktree with ports, verify .env contents
- Docker Compose override generation with explicit mapping
- Port registry persistence across restarts
- Port registry persistence across restarts

#### E2E Tests

- Full create → list → delete workflow
- Multi-project port isolation

### Rollout Plan

#### Phase 1: Core CLI (MVP)
- Project setup with Citty + tsup
- `create` command with git worktree + .env handling
- `list` command
- `delete` command
- Global port registry with file-based storage

#### Phase 2: Docker Integration
- Docker Compose detection
- Override file generation using explicit `portMapping` config
- Gitignore warning

#### Phase 3: Polish
- `status` command with rich output
- Error messages and help text
- npm publishing with bin entry [9]

---

## Decision Records

### DR-001: Remove Zellij Integration
**Decision**: All Zellij terminal multiplexer features have been removed from scope.
**Rationale**: Per user feedback, Zellij integration adds significant complexity (session management, terminal spawning, cross-platform terminal emulator detection) without proportional value. Users can manage terminals manually.
**Impact**: Simpler codebase, faster MVP delivery, no terminal-specific dependencies.

### DR-002: Explicit Docker Port Mapping
**Decision**: Docker Compose port mapping requires explicit `portMapping` configuration in `.ai-env.json`.
**Rationale**: Auto-detection via `${VAR_NAME}` scanning is unreliable across different compose file styles and adds parsing complexity.
**Alternative**: Auto-scanning docker-compose.yml was rejected.

### DR-002a: Docker Override Stored Outside Repo
**Decision**: The `docker-compose.override.yml` file is stored outside the repository at `~/.local/state/ai-env-manager/overrides/`.
**Rationale**: Storing inside the worktree risks AI agents accidentally committing it. Using `COMPOSE_FILE` env var in `.env` points Docker Compose to both files without any repo-tracked files.
**Alternative**: Storing in worktree with .gitignore was rejected - AI agents ignore .gitignore.

### DR-003: Global Shared Port Pool
**Decision**: All projects share a single port pool (30000-39999) with a global registry tracking allocations.
**Rationale**: Provides flexibility without artificial per-project limits. A project with many worktrees isn't constrained to 100 ports.
**Alternative**: Fixed 100-port blocks per project was rejected as too limiting.

### DR-004: Immediate Port Reuse
**Decision**: When a worktree is deleted, its ports are immediately available for reuse.
**Rationale**: Maximizes port space efficiency. Simplifies implementation. Users can check current allocations via `ai-env list`.
**Alternative**: 24-hour reservation or append-only allocation were rejected as unnecessary complexity.

### DR-005: Only Copy .env Files
**Decision**: The tool only copies `.env.example` → `.env`, no configurable file copy patterns.
**Rationale**: Keeps scope focused on the core problem (port management). Other file copying needs can be addressed in future versions or via git worktree's built-in capabilities.
**Alternative**: Configurable `copyFiles` patterns were rejected to reduce scope.

### DR-006: Activate Command via Shell Eval
**Decision**: The `activate` command outputs shell commands (like `cd /path`) for the user to eval.
**Rationale**: Subprocesses cannot change the parent shell's working directory. Common pattern used by tools like direnv, nvm, conda.
**Usage**: `eval "$(ai-env activate feature-auth)"`

### DR-007: Create Auto-Activates
**Decision**: After `create` completes, it outputs the activation command for immediate use.
**Rationale**: Most common workflow is create-then-work-in, so auto-activating saves a step.

---

## References

1. [gwq: Git worktree manager with fuzzy finder](https://github.com/d-kuro/gwq) - d-kuro, 2024
   - Summary: Reference implementation for worktree management designed for parallel AI coding
   - Key takeaway: Global worktree registry concept

2. [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) - CodeRabbit, 2024
   - Summary: Automation tool for worktree creation with file copying and hooks
   - Key takeaway: AI tool support patterns

3. [Citty: Elegant CLI Builder](https://github.com/unjs/citty) - UnJS, 2024
   - Summary: TypeScript-first CLI framework with modern ESM support
   - Key takeaway: defineCommand pattern, subcommand handling, async support

4. [TypeScript in 2025 with ESM and CJS](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) - Liran Tal, 2025
   - Summary: Current state of TypeScript module publishing
   - Key takeaway: Node.js 20+ native ESM support, tsup for bundling

5. [Preventing Port Conflicts in Docker Compose](https://www.markcallen.com/preventing-port-conflicts-in-docker-compose-with-dynamic-ports/) - Mark Callen, 2024
   - Summary: Dynamic port allocation strategies for Docker development
   - Key takeaway: Override files preferred over modifying main compose file

6. [The 3 Best Config File Formats](https://jhall.io/posts/best-config-file-formats/) - Jonathan Hall, 2024
   - Summary: Comparison of JSON, YAML, TOML for configuration
   - Key takeaway: TOML recommended for human-edited config, JSON for machine config

7. [Citty Package Documentation](https://unjs.io/packages/citty/) - UnJS, 2025
   - Summary: Official Citty documentation with API reference
   - Key takeaway: defineCommand usage, 9.5M+ monthly downloads

8. [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) - freedesktop.org
   - Summary: Standard for application file locations on Linux
   - Key takeaway: Config in ~/.config, state in ~/.local/state

9. [Building a simple CLI tool with npm bin](https://evertpot.com/node-changelog-cli-tool/) - Evert Pot, 2024
   - Summary: How to publish executable CLI tools to npm
   - Key takeaway: bin field in package.json, npx execution pattern

10. [tsup Documentation](https://tsup.egoist.dev/) - egoist, 2024
    - Summary: Zero-config TypeScript bundler
    - Key takeaway: ESM/CJS dual output, fast builds via esbuild

11. [Git Worktree Documentation](https://git-scm.com/docs/git-worktree) - Git Project, 2024
    - Summary: Official git worktree command reference
    - Key takeaway: Lifecycle management, automatic cleanup options

12. [Docker Compose Services](https://docs.docker.com/reference/compose-file/services/) - Docker, 2024
    - Summary: Official Docker Compose file reference
    - Key takeaway: Override file merge behavior, port mapping syntax

---

### Research Summary

**Recommended Patterns Applied**:
- Citty + tsup for modern TypeScript CLI [3][7][10]
- XDG directory compliance for config/state storage [8]
- docker-compose.override.yml for port customization [5][12]

**Anti-Patterns Avoided**:
- Global npm installation (use npx instead) [9]
- Modifying tracked docker-compose.yml [5]
- Random port allocation without registry
- Hardcoded paths instead of XDG resolution [8]

**Technologies Selected**:
- **Citty**: TypeScript-first, 9.5M+ monthly downloads, UnJS ecosystem [3][7]
- **tsup**: Fast bundling, ESM/CJS dual output [10]

**Standards Compliance**:
- XDG Base Directory Specification for file locations [8]
- Git worktree conventions for lifecycle management [11]
- Docker Compose override file pattern [12]
