# Content guide

The portfolio is two kinds of page, and they are edited in two different places.

| Page | Type | Edit where |
|---|---|---|
| `/resume` | static Astro page | `web/src/pages/resume.astro` |
| `/contact` | static Astro page | `web/src/pages/contact.astro` |
| `/about` | note (`kind = page`) | `/admin` |
| `/now` | note (`kind = page`) | `/admin` |
| `/projects` | note (`kind = page`) | `/admin` |
| project entries | notes (`kind = project`, parent `projects`) | `/admin` |
| `/directory` | generated from published notes | — |

Static pages need a redeploy after you edit them. Notes only need a **Publish**,
which triggers the rebuild.

## The voice

You said you don't want to sound like you know it all. Keep it first person, specific,
and honest. Curiosity reads better than authority:

- "I'm not an expert" is fine. "Passionate thought leader" is not.
- Say what you built and what it taught you.
- Numbers beat adjectives where you have them.
- Write like you're explaining it to a friend.

The copy below is a starting point, not a script. Change it.

## `/about`

> I'm Muhd, a developer in Osun, Nigeria.
>
> I'm not an expert. I'm curious, I like building small things, and I write down what I
> learn as I go. This site is my notebook — part portfolio, part thinking out loud.
>
> Right now I'm getting better at TypeScript, Postgres, and shipping things that don't
> fall over. I'm open to work and collaborations.
>
> Elsewhere: [email] · [github] · [linkedin]

## `/now`

Update this monthly. A stale "now" page is worse than none.

> What I'm doing right now (updated [Month Year]):
>
> - Looking for work and collaborations where I can learn from people better than me.
> - Building [project] and breaking it in public.
> - Reading [book] and practising [skill].
> - Open to feedback — brutal is fine.
>
> This page changes; the rest of the wiki is the archive.

## `/projects`

The parent page. Its **children** are rendered automatically under "in this section",
so add each project as a note with `parent = projects` and `kind = project`.

> Things I'm building, breaking, and learning from. None of these are finished, and
> that's part of the point.
>
> Currently working on:
>
> - [Project] — [one line] — [link]
>
> Past experiments:
>
> - [Project] — [what it taught me]
>
> If you're working on something and want another pair of hands,
> [say hello](/contact).

Each project note should answer: what it is, the stack, what you did, what you learned,
one result or metric, and a link. If there is no metric, say what changed.

## `/resume`

Edit `web/src/pages/resume.astro`. Replace every `[bracketed]` placeholder:

- `email` and `linkedin` in the frontmatter
- role, company, dates, bullets
- the second project
- learning items

Drop your PDF at `web/public/resume.pdf`; the "pdf" link points there.

Keep the resume to one page. Bullets should be results, not duties.

## `/contact`

Edit `web/src/pages/contact.astro`. Replace `email` and `linkedin` in the frontmatter.
Say what you're looking for — work, collaboration, feedback — and what you're not
(an expert). That honesty is the point.

## Notes and writing

`/directory` is generated from published notes. For a portfolio, curate: 5–8 polished
pieces, not everything you've ever written. Keep half-thoughts as drafts.

Don't title a note **Resume** or **Contact** — those slugs belong to the static pages,
and the build will refuse to overwrite them.

## Before you share the link

- [ ] Replace every `[bracket]` in `resume.astro` and `contact.astro`
- [ ] Add `web/public/resume.pdf`
- [ ] Replace the seed `about`, `now`, `projects` notes with the copy above
- [ ] Publish 3–5 real notes
- [ ] Delete or draft the seed notes you don't want public
- [ ] Open the site on a phone
- [ ] Share one link somewhere and check the preview

## Why a code change needs a redeploy

Notes live in Postgres, so changing one only needs a rebuild. The resume and contact
pages are files in the repo, so changing them needs a new build **and** an upload to
Pages:

```bash
PUBLIC_API_URL=https://api.moyomi.xyz pnpm --filter web build
cd api && ./node_modules/.bin/wrangler pages deploy ../web/dist --project-name <project>
```
