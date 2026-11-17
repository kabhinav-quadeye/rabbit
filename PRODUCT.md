# Rabbit

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Expo with React Native and gluestack UI, mobile first, with a web build for preview. Use current stable compatible versions where possible, as requested by the user.

## Users

Friends and small communities recording useful information and sharing it with selected people and private circles. The user confirmed this audience on 2026-10-30.

## Product Purpose

A private Reddit-like space built around posting useful information and retrieving it through search.

## Capabilities and Constraints

Users can post to themselves, another user, or a circle. Users discover people by unique username and send friend requests from Profile. Accepted requests create mutual friendships. Members can add only their own accepted friends to circles they belong to, including when creating a circle. Existing circle membership is preserved. Home is an easy post composer with a search toggle. Recent, Goals and Profile are the other three primary tabs. Goals is a private space where people break big goals into a tree of tasks, see the next actionable tasks for each goal, and see what they completed in the last seven days; goals are never shared or searchable (issue #13, confirmed 2026-11-15). Recent provides shortcuts into circles. Search covers accessible information only. Profile → Agents lets users create named, expiring agent tokens, review proposed drafts and see recent activity. Agents can search/read accessible posts and set useful/outdated feedback; publishing a draft requires the user’s review and creates a private note. Tokens grant no goal/task or circle-management rights.

## Operating Context

Expo native app with a responsive web version. Initial local development and preview run in this repository. No external identity provider or hosted deployment was supplied.

## Evidence on Hand

The repository name is rabbit and has an existing geometric icon in assets/icon.svg. Example people, circles and posts are explicitly demonstration data.

## Product Principles

- Put writing and finding useful information first.
- Make the audience visible before posting.
- Keep circle membership and access consistent across search and feeds.
- Make the core tasks comfortable on a phone.
- Keep the next small step visible: goals lead with what to do next and recent progress, not with configuration.
