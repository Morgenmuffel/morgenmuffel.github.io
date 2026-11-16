# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hiring managers:** design and product leads who received the case-study password with a job application. They read closely and want to see judgement, process and the real screens.
- **Recruiters:** they skim a case study in about a minute for role, scope, company and outcome.

## Product Purpose

The personal portfolio of Yulia Vilensky, a Senior Design Engineer in conversational and agentic AI, based in Berlin and open to remote work across Europe. It exists to win interviews: the home page states the positioning, and the case studies prove it with real work. Success means a reader leaves knowing what she owned, how she decided, and what changed, and then gets in touch.

## Positioning

A designer who works across agent behaviour (prompts, tool contracts, conversational flows) and the interfaces agents act through, and who builds them in production code herself. She has 15+ years across embedded and software engineering, UX for complex B2B SaaS and data-heavy products, and AI design.

## Operating Context

- Readers arrive from an application, a LinkedIn profile or a direct link. They read the Dyver studies after unlocking them with the password.
- Case studies are written as Context, Problem, Process, Proposal and Result, with screen-by-screen journeys and screen recordings.

## Capabilities and Constraints

- Static site: hand-written HTML, CSS and JS. `scripts/build.mjs` generates `work/<slug>.html` and the home page's Work list from `content/cases.json`, and Vercel serves the result.
- Public studies come from `content/cases/<slug>.html`. The Dyver studies live in git-ignored `_private/dyver/` and ship only as AES-GCM ciphertext; the browser decrypts them after the password is entered.
- The pages are called case studies, not projects.
- The contact form posts to Web3Forms.

## Brand Commitments

- Name: Yulia Vilensky.
- Dyver work shows unreleased product. It stays behind the password and is captured on staging with a 20-product sample catalog.

## Evidence on Hand

- Seven case studies: four for Dyver (protected), two for Movebite and one for ImmobilienScout24.
- Dyver media: 3024×1714 screen captures and MP4 recordings in `_private/dyver/media/`; public covers in `assets/site/covers/`.
- There are no testimonials, client logos or outcome metrics beyond what each study states. Do not invent any.

## Product Principles

1. Show the real work, big and whole: screens are evidence, not decoration.
2. A recruiter gets role, scope and outcome within a minute; a hiring manager can go as deep as they want.
3. Say plainly what she owned and what others built.
4. One world across the site: the home page's valley, its type and its colours carry into every case study.
