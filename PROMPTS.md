# PROMPTS.md

> Reusable prompts. Every prompt begins by reading: AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md.
> Principal use for this file its for contributors that want to use AI, i tested this on another file of the project and its working very very well

## Implement Feature

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md.

Implement [FEATURE NAME].

Requirements:
- [requirement 1]
- [requirement 2]

Constraints:
- TypeScript strict
- No new dependencies unless justified
- Reuse existing components and patterns
- Build after implementation
- Fix all TypeScript and build errors
```

## Bug Fix

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md.

Fix [BUG DESCRIPTION].

Steps:
1. Identify root cause
2. Implement minimal fix
3. Verify fix doesn't break other code
4. Build and typecheck
```

## Refactor

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md.

Refactor [MODULE/COMPONENT].

Goals:
- Improve [readability/performance/maintainability]

Constraints:
- Preserve existing behavior
- No API changes
- No new dependencies
- Build and typecheck after
```

## Documentation Update

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md.

Update documentation for [CHANGE].

Files to update:
- AGENTS.md (if architecture changed)
- PROJECT_MAP.md (if files moved/created)
- DECISIONS.md (if new decision made)
- TASKS.md (move completed items)

Keep docs concise, bullet-pointed, no duplication.
```

## UI Improvement

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md.

Improve [UI COMPONENT/SECTION].

Requirements:
- Premium SaaS quality (Linear, Vercel, Stripe level)
- Dark mode by default
- Fully responsive
- Smooth animations
- Accessible

Constraints:
- No framer-motion (use CSS animations)
- Use existing TailwindCSS utilities
- Reuse existing components
- Build after implementation
```

## Security Review

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md.

Review [MODULE] for security issues.

Check:
- Input validation
- Authentication/authorization
- Secrets in code or logs
- SQL injection
- XSS vulnerabilities
- CSRF protection
- Rate limiting
```

## Performance Review

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md.

Review [MODULE/SECTION] for performance.

Check:
- Bundle size impact
- Render performance
- Memory leaks
- Unnecessary re-renders
- Image/asset optimization
- Caching strategy
```

## GitHub Prerelease Flag

```
When creating a GitHub release:
- `-dev`, `-alpha`, `-beta`, and `-rc` versions MUST use GitHub's **Pre-release** flag.
- Only final stable versions such as `1.3.0` may be published without the Pre-release flag.
- Prerelease versions must never be presented as the stable/latest release.
```

## Release

```
Read AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md.

Make this Unreleased release [VERSION]:
- Bump root/backend/frontend package.json versions
- Freeze/move the entire Unreleased changelog into [VERSION] with today's date and update/add the correct Keep a Changelog compare links
- Sync OpenAPI version
- Commit
- Create annotated tag v[VERSION]
- Push branch + tag
- Create the GitHub release with the changelog notes

Constraints:
- Do NOT modify any code, features, configs, migrations, TODOs, or anything unrelated to the release/versioning work
- Do not change any changelog content except the release heading/date/links
- Before creating the GitHub release, verify whether the version is prerelease; if it contains -dev, -alpha, -beta, or -rc, the GitHub Pre-release flag MUST be enabled
```
