name: Bug report
description: Create a report to help us improve
title: "[BUG]: "
labels: [] # Dejamos esto vacío para que la etiqueta se gestione según lo elegido abajo o por los mantenedores

body:
  - type: dropdown
    id: bug_type
    attributes:
      label: Bug Category
      description: Select the category that best fits this issue.
      options:
        - bug
        - UI/UX
        - performance
        - security
    validations:
      required: true # <--- Esto hace que sea obligatorio seleccionar una categoría antes de enviar

  - type: textarea
    id: description
    attributes:
      label: Describe the bug
      description: A clear and concise description of what the bug is.
    validations:
      required: true

  - type: textarea
    id: reproduce
    attributes:
      label: To Reproduce
      description: Steps to reproduce the behavior.
      placeholder: |
        1. Go to '...'
        2. Click on '....'
        3. Scroll down to '....'
        4. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: A clear and concise description of what you expected to happen.
    validations:
      required: false

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: If applicable, drag and drop screenshots to help explain your problem.
    validations:
      required: false

  - type: textarea
    id: desktop_environment
    attributes:
      label: Desktop Environment
      description: Please complete the following information if applicable.
      placeholder: |
        - OS: [e.g. macOS / Windows / Linux]
        - Browser: [e.g. Chrome, Firefox, Safari]
        - Version: [e.g. 120]
    validations:
      required: false

  - type: textarea
    id: smartphone_environment
    attributes:
      label: Smartphone Environment
      description: Please complete the following information if applicable.
      placeholder: |
        - Device: [e.g. Pixel 7, iPhone 14]
        - OS: [e.g. Android 14, iOS 17]
        - Browser: [e.g. Chrome, Safari]
        - Version: [e.g. 120]
    validations:
      required: false

  - type: textarea
    id: additional_context
    attributes:
      label: Additional context
      description: Add any other context about the problem here.
    validations:
      required: false
