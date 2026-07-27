# PROMPTS.md

> Reusable prompts. Every prompt begins by reading: AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md.

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
