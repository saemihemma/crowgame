# What Hörmann knows about your child

Status: Supportive
Authority: Written for parents. The behaviour it describes is implemented in
`godot/scripts/**` and `server/**`; if they ever disagree, the code is what runs
and this page is a bug.
Last verified against code: 2026-08-25

Hörmann is a maths game for young children. This page says, in plain terms, what it
stores, what leaves your device, and how to delete all of it.

## The short version

- Hörmann works with **no account at all**. Out of the box, everything stays on the
  device your child plays on.
- If you turn on cloud save, the only personal detail we ask for is **one
  grown-up's email address**. That is the only piece of personal information
  stored anywhere.
- Your child's **name is just a label they picked**. We never ask for their real
  name, age, birthday, school, photo, or location, and there is nowhere in the
  game to enter any of it.
- There are **no ads, no analytics, no tracking, and no third parties**. Nothing
  about your child is sold, shared, or used to build a profile.
- You can **export everything** and **delete everything**, at any time, and the
  delete is immediate and permanent.

## What is stored on your device

Whether or not you use cloud save, the game keeps this on the device:

- your child's chosen display name and their 4-digit PIN
- their progress: coins, stars, levels finished, owls helped
- how the maths is going: which topics are unlocked, roughly how hard the
  questions should be, and which ones are due for another look
- a short history of recent answers, used to decide what to ask next

**About that PIN: it is not a password.** It exists so two children sharing one
iPad can each find their own progress. Anyone holding the device can pick any
child and type any PIN — the game does not check it against anything, and it is
never sent anywhere. Please do not treat it as protecting anything.

Clearing your browser's data for the site erases all of the above. If you are not
using cloud save, that is unrecoverable, which is the main reason cloud save
exists.

## What leaves your device

Only three things, and only ever to Hörmann's own server:

**1. If you turn on cloud save** — your child's progress, so it can appear on
another device. That is the same information listed above. It is stored against a
family, and a family is identified by the grown-up email address you gave.

**2. A record of answers** — which question, right or wrong, first try or not, and
how long it took. This is what makes the game adapt, and it is what lets us tell
you nothing was lost if a device breaks.

**3. Error reports, when something goes wrong** — what broke, and coarse facts
about the device: screen size, browser language, which build was running. No
names, no progress, no free text, and never anything your child typed. These are
kept for 30 days and then deleted automatically; only anonymous counts of "this
bug happened N times" are kept longer.

## What we never collect

No real names. No ages or birthdays. No location. No photos, audio, or video. No
contacts. No advertising identifiers. No cross-site tracking. No behavioural
profiles. No data sold or shared with anyone.

The only personal detail in the whole system is the grown-up email address, and it
is used for exactly one thing: emailing you a sign-in link.

## Keeping families apart

Each family's data is fenced off from every other family's inside the database
itself, not just in the app's code. Even a mistake in the application cannot make
one family's records visible to another.

## Getting your data, or deleting it

Both are available from the moment anything is stored, not as a later addition:

- **Export** — download everything held about your family as one file.
- **Delete** — erase your family completely. Every child, every save, every
  answer. It is an immediate, permanent delete, not a hidden flag, and it cannot
  be undone.

Ask us and we will do it for you, or use the cloud panel in the game.

## Protecting your child's progress (please read this one)

Browsers throw away stored data. **Safari deletes a website's saved data after
about seven days of not visiting it** — so a child who plays for a fortnight, then
takes a two-week holiday, can come back to a brand-new game with their name and
progress gone.

Two things prevent that, and the first is free:

1. **Add Hörmann to the Home Screen.** In Safari, tap the Share button and choose
   "Add to Home Screen". Opened from that icon, the game is treated as an
   installed app and is not subject to the seven-day rule. It also opens
   fullscreen with no browser chrome, which is nicer for a child anyway.
2. **Turn on cloud save** (Cloud save, from the main menu). Progress is then kept
   on our server too, and follows your child to another device.

If you do neither, the game still works — but the only copy of your child's
progress is in that browser, and browsers forget.

## If you would rather use nothing at all

Do not turn on cloud save. The game is fully playable, forever, with nothing ever
leaving the device — no reduced features, no nagging. Cloud save exists because
browsers do sometimes throw away stored data (Safari in particular clears it after
about a week of not being used, which can lose weeks of a child's progress), not
because the game needs a server.

## Questions

Open an issue in the repository, or see [SECURITY.md](./SECURITY.md) to report
something privately.
