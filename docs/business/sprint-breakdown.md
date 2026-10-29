# Sprint Breakdown

The BA workbook does not define sprint numbers. This document proposes implementation sequencing
from the approved user stories and acceptance criteria. Foundation v1.0.0 is already implemented;
all BA features below are planned.

## Sprint Overview

| Phase      | Goal                                                 | Stories                    | Status      |
| ---------- | ---------------------------------------------------- | -------------------------- | ----------- |
| Foundation | Engineering base, health, infrastructure, CI, docs   | Technical foundation       | Implemented |
| Sprint 1   | Upload, duplicate prevention, metadata extraction    | US-01, US-02, US-03        | Planned     |
| Sprint 2   | Smart tags, auto categories, search, related docs    | US-04, US-05, US-06, US-07 | Planned     |
| Sprint 3   | Preview, single download, bulk download              | US-08, US-09, US-10        | Planned     |
| Sprint 4   | Analytics, audit trail, category download permission | US-11, US-12, US-13        | Planned     |

## Foundation

Foundation delivers the runtime, package, infrastructure, and operational base only. It does not
ship BA business features.

## Sprint 1

Goal: Member Team can upload supported files, receive duplicate warnings, and see extracted
metadata.

## Sprint 2

Goal: system can classify documents through Smart Tags and categories, then support fast search
and related-document discovery.

## Sprint 3

Goal: Member Team can preview, download one document, and download selected documents as `.zip`.

## Sprint 4

Goal: Head of Team can monitor adoption, view download audit logs, and control download
permission by category.

## Admin (usulan, belum ada sprint)

The Admin role is not in the BA workbook, and the BA has not approved it. Its proposal IDs
(PROP-ADM-01 to PROP-ADM-05 and PROP-ADM-AC-01.01 to PROP-ADM-AC-05.01) are not BA IDs. They appear
only in the proposal [proposals/admin-role-proposal.md](../proposals/admin-role-proposal.md), which
is not a BA source. No sprint covers them.
