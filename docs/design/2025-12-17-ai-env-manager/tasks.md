# Implementation Tasks: AI Environment Manager

## Overview

Building a TypeScript CLI tool for managing git worktrees with automatic port allocation. The tool uses Citty (UnJS) for CLI framework, tsup for bundling, and follows XDG Base Directory Specification for config/state storage.

**Phases**: 6 phases, progressing from project skeleton through core features to polish.

---

## Phase 1: Project Skeleton
**Goal**: Establish project structure with working CLI that responds to commands
**Demo**: "At standup, I can show: running `npx ai-env --help` displays available commands"

### Tasks

- [x] Task 1.1: Initialize npm project with TypeScript + ESM
  - **Output**: Working package.json with TypeScript, ESM configuration
  - **Files**: `package.json`, `tsconfig.json`
  - **Verify**: `npm install` succeeds, `npx tsc --noEmit` passes

- [x] Task 1.2: Configure tsup for CLI bundling
  - **Output**: Build produces executable CLI entry point
  - **Files**: `tsup.config.ts`, update `package.json` with bin entry
  - **Verify**: `npm run build` produces `dist/index.js`

- [x] Task 1.3: Create CLI entry point with Citty
  - **Output**: Main CLI with subcommand structure (stubs only)
  - **Files**: `src/index.ts`
  - **Verify**: `npx ai-env --help` shows command list

- [x] Task 1.4: Add stub commands (create, activate, list, delete, status)
  - **Output**: All 5 commands registered, each outputs "Not implemented yet"
  - **Files**: `src/commands/create.ts`, `src/commands/activate.ts`, `src/commands/list.ts`, `src/commands/delete.ts`, `src/commands/status.ts`
  - **Depends on**: 1.3
  - **Verify**: `npx ai-env create foo` outputs stub message

### Phase 1 Checkpoint
- [x] Run lint: `npm run lint` (if configured) or `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Manual verification: Run `npx ai-env --help`, `npx ai-env create test`, `npx ai-env list`
- [x] **Demo ready**: CLI responds to all commands with help or stub messages

---

## Phase 2: Config & Utils Layer
**Goal**: Config loading and name sanitization utilities work correctly
**Demo**: "At standup, I can show: CLI reads `.ai-env.json` and sanitizes names"

### Tasks

- [x] Task 2.1: Create path utilities with XDG compliance
  - **Output**: Functions to resolve config/state paths following XDG spec
  - **Files**: `src/utils/paths.ts`
  - **Verify**: Returns `~/.config/ai-env-manager/` for config, `~/.local/state/ai-env-manager/` for state

- [x] Task 2.2: Create name sanitization utility
  - **Output**: Function to sanitize names for git branches and filesystem
  - **Files**: `src/utils/naming.ts`
  - **Verify**: `sanitizeName("My Feature!")` returns `"my-feature"`

- [x] Task 2.3: Create global config loader
  - **Output**: Loads `~/.config/ai-env-manager/config.json` with defaults
  - **Files**: `src/config/global.ts`
  - **Depends on**: 2.1
  - **Verify**: Returns default port range when no config exists

- [x] Task 2.4: Create project config loader
  - **Output**: Loads `.ai-env.json` from project root, merges with global
  - **Files**: `src/config/project.ts`
  - **Depends on**: 2.3
  - **Verify**: Project config overrides global defaults

- [x] Task 2.5: Add unit tests for utilities
  - **Output**: Tests for naming sanitization and config loading
  - **Files**: `src/utils/naming.test.ts`, `src/config/project.test.ts`
  - **Depends on**: 2.2, 2.4
  - **Verify**: `npm test` passes

### Phase 2 Checkpoint
- [x] Run lint: `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test`
- [x] Manual verification: Test sanitization with edge cases (spaces, special chars)
- [x] **Demo ready**: Config system loads files, name sanitization handles edge cases

---

## Phase 3: Port Registry Service
**Goal**: Port allocation and release with file-based persistence
**Demo**: "At standup, I can show: allocating ports writes to registry file, deleting releases them"

### Tasks

- [x] Task 3.1: Create port registry data types
  - **Output**: TypeScript interfaces for PortRegistry and PortAllocation
  - **Files**: `src/services/ports.ts` (types only)
  - **Verify**: Types compile without errors

- [x] Task 3.2: Implement registry read/write with file locking
  - **Output**: Functions to atomically read and write ports.json
  - **Files**: `src/services/ports.ts`
  - **Depends on**: 3.1, 2.1 (for paths)
  - **Verify**: Registry file created at `~/.local/state/ai-env-manager/ports.json`

- [x] Task 3.3: Implement port allocation
  - **Output**: `allocatePorts()` finds next available ports in range
  - **Files**: `src/services/ports.ts`
  - **Depends on**: 3.2
  - **Verify**: Calling twice returns different ports

- [x] Task 3.4: Implement port release
  - **Output**: `releasePorts()` removes allocations for project/env
  - **Files**: `src/services/ports.ts`
  - **Depends on**: 3.2
  - **Verify**: Released ports can be reallocated immediately

- [x] Task 3.5: Add port service tests
  - **Output**: Tests for allocation, release, concurrent access
  - **Files**: `src/services/ports.test.ts`
  - **Depends on**: 3.3, 3.4
  - **Verify**: `npm test` passes

### Phase 3 Checkpoint
- [x] Run lint: `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test`
- [x] Manual verification: Inspect `~/.local/state/ai-env-manager/ports.json` after allocation
- [x] **Demo ready**: Port allocation persists to disk, prevents conflicts

---

## Phase 4: Git & Env Services
**Goal**: Git worktree creation and .env file handling
**Demo**: "At standup, I can show: `ai-env create foo` creates worktree with configured ports in .env"

### Tasks

- [x] Task 4.1: Implement git service - worktree creation
  - **Output**: `createWorktree()` creates branch + worktree
  - **Files**: `src/services/git.ts`
  - **Verify**: Creates worktree directory and git branch

- [x] Task 4.2: Implement git service - list worktrees
  - **Output**: `listWorktrees()` parses `git worktree list --porcelain`
  - **Files**: `src/services/git.ts`
  - **Depends on**: 4.1
  - **Verify**: Returns array of worktree info objects

- [x] Task 4.3: Implement git service - remove worktree
  - **Output**: `removeWorktree()` removes worktree and optionally branch
  - **Files**: `src/services/git.ts`
  - **Verify**: Worktree directory removed, branch deleted if requested

- [x] Task 4.4: Implement env service - copy and configure
  - **Output**: Copies `.env.example` → `.env`, updates PORT variables
  - **Files**: `src/services/env.ts`
  - **Verify**: `.env` in worktree has allocated port values

- [x] Task 4.5: Implement env service - scan for port variables
  - **Output**: Finds all `*_PORT` variables in .env files
  - **Files**: `src/services/env.ts`
  - **Depends on**: 4.4
  - **Verify**: Returns array of port variable names

- [x] Task 4.6: Wire up create command
  - **Output**: Full `create` command using all services
  - **Files**: `src/commands/create.ts`
  - **Depends on**: 4.1, 4.4, 3.3, 2.2, 2.4
  - **Remove**: Stub implementation from Phase 1
  - **Verify**: `ai-env create foo` creates working environment

- [x] Task 4.7: Wire up list command
  - **Output**: `list` command shows worktrees with ports
  - **Files**: `src/commands/list.ts`
  - **Depends on**: 4.2, 3.2
  - **Remove**: Stub implementation
  - **Verify**: `ai-env list` shows table of environments

- [x] Task 4.8: Wire up delete command
  - **Output**: `delete` command with confirmation
  - **Files**: `src/commands/delete.ts`
  - **Depends on**: 4.3, 3.4
  - **Remove**: Stub implementation
  - **Verify**: `ai-env delete foo` removes worktree and releases ports

### Phase 4 Checkpoint
- [x] Run lint: `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test`
- [x] Manual verification: Full create → list → delete workflow in a test repo
- [x] **Demo ready**: Core worktree management works end-to-end

---

## Phase 5: Docker Integration
**Goal**: Docker Compose override file generation with external storage
**Demo**: "At standup, I can show: `ai-env create` generates docker override outside repo, sets COMPOSE_FILE"

### Tasks

- [x] Task 5.1: Implement Docker Compose override generation
  - **Output**: Generates override YAML from portMapping config
  - **Files**: `src/services/env.ts` (add to existing)
  - **Verify**: Override file created with correct port mappings

- [x] Task 5.2: Store override outside repo
  - **Output**: Override written to `~/.local/state/ai-env-manager/overrides/<hash>/<env>/`
  - **Files**: `src/services/env.ts`
  - **Depends on**: 5.1, 2.1
  - **Verify**: No docker files in worktree directory

- [x] Task 5.3: Add COMPOSE_FILE to .env
  - **Output**: Appends `COMPOSE_FILE=docker-compose.yml:<override-path>` to .env
  - **Files**: `src/services/env.ts`
  - **Depends on**: 5.2
  - **Verify**: `docker compose config` in worktree shows merged config

- [x] Task 5.4: Update create command for Docker
  - **Output**: Create detects docker-compose.yml and generates override if portMapping exists
  - **Files**: `src/commands/create.ts`
  - **Depends on**: 5.3
  - **Verify**: Creating in a Docker project sets up override automatically

- [x] Task 5.5: Clean up override on delete
  - **Output**: Delete command removes override directory
  - **Files**: `src/commands/delete.ts`
  - **Depends on**: 5.2
  - **Verify**: Override directory removed when worktree deleted

### Phase 5 Checkpoint
- [x] Run lint: `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test` (71 tests, including 41 new env.test.ts tests)
- [x] Manual verification: Test with a real docker-compose.yml project
- [x] **Demo ready**: Docker port conflicts solved, no files in git status

---

## Phase 6: Activate, Status & Polish
**Goal**: Complete CLI with activate command and helpful output
**Demo**: "At standup, I can show: `eval $(ai-env activate foo)` changes directory, status shows summary"

### Tasks

- [x] Task 6.1: Implement activate command
  - **Output**: Outputs `cd /path/to/worktree` for shell eval
  - **Files**: `src/commands/activate.ts`
  - **Remove**: Stub implementation
  - **Verify**: `eval "$(ai-env activate foo)"` changes directory

- [x] Task 6.2: Update create to output activation command
  - **Output**: Create prints activation command at end
  - **Files**: `src/commands/create.ts`
  - **Depends on**: 6.1
  - **Verify**: Create output includes eval command

- [x] Task 6.3: Implement status command
  - **Output**: Shows project summary, env count, port usage
  - **Files**: `src/commands/status.ts`
  - **Remove**: Stub implementation
  - **Verify**: `ai-env status` shows formatted summary

- [x] Task 6.4: Add helpful error messages
  - **Output**: User-friendly errors with remediation suggestions
  - **Files**: All command files
  - **Verify**: Errors explain what went wrong and how to fix

- [x] Task 6.5: Add --verbose flag
  - **Output**: Verbose mode shows detailed operation logs
  - **Files**: `src/index.ts`, command files
  - **Verify**: `--verbose` shows extra detail

- [x] Task 6.6: Improve list output formatting
  - **Output**: Clean table output for list command
  - **Files**: `src/commands/list.ts`
  - **Verify**: List shows aligned, readable table

### Phase 6 Checkpoint
- [x] Run lint: `npx tsc --noEmit`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test` (71 tests passing)
- [ ] Manual verification: Full workflow including activate
- [ ] **Demo ready**: Complete, polished CLI ready for use

---

## Final Verification
- [ ] All requirements from design doc met (REQ-001 through REQ-009)
- [ ] All stub implementations replaced with working code
- [ ] Tests comprehensive for utilities and services
- [ ] Error messages helpful and actionable
- [ ] `git status` clean in worktrees (no docker-compose changes)
- [ ] Port conflicts prevented across multiple environments
