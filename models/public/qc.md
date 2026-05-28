# QC - QUALITY CONTROL

Standards, checks, and validation rules for the brain.

---

## BUILD STANDARDS

- All tests pass before release
- No breaking changes without version bump
- Backward compatible

## CODE STANDARDS

- Use synchronous APIs where possible
- Minimal dependencies
- Clear error handling
- Console for output

## MODEL STANDARDS

- Markdown for text content
- JSON for structured data
- One concept per file
- No secrets in public model

## TESTING

- All tests must pass
- Include health checks
- Include load checks

---

## QC CHECKLIST

Before any release:
- [ ] All tests pass
- [ ] Health check passes
- [ ] No secrets in public model
- [ ] Changelog updated
- [ ] Version bumped