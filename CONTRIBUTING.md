# Contributing to OTel Collector Viewer

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/AlainGhawi/otel-collector-viewer.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/my-feature`
5. Start the dev server: `ng serve`

## Development Guidelines

### Code Style

- Follow the [Angular Style Guide](https://angular.dev/style-guide)
- Use meaningful variable and function names
- Add JSDoc comments to public APIs
- Keep components focused and single-responsibility

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new pipeline node type
fix: correct YAML serialization for nested processors
docs: update README with new architecture diagram
refactor: extract graph layout logic into service
test: add unit tests for config parser
chore: update d3.js dependency
```

### Branch Naming

- `feature/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation updates
- `refactor/description` — code refactoring

## Pull Request Process

1. Ensure all tests pass: `ng test`
2. Ensure linting passes: `ng lint`
3. Update documentation if needed
4. Fill out the PR template completely
5. Request a review

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Steps to reproduce
- Expected vs actual behavior
- Browser and OS information
- Screenshots if applicable

## Requesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Questions?

Open a [Discussion](https://github.com/AlainGhawi/otel-collector-viewer/discussions) for questions or ideas.
