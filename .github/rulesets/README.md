# A4 required check

`a4-print.json` is the ruleset definition for the stable required check:

```text
A4 print regression required
```

Import it under **Settings → Rules → Rulesets → New ruleset → Import a ruleset**
and activate it for the default branch. The summary job runs after both the
Ubuntu and Windows A4 matrix jobs, so this one check covers both platforms.

Repository rules are GitHub settings, not files that run from the repository;
the JSON is kept here so the setting can be reviewed and imported consistently.
