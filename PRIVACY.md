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
- There are **no ads, no analytics, and no tracking**. Nothing about your child is
  sold, shared, or used to build a profile. Nothing about a *child* reaches a
  third party at all. The one exception is the grown-up's own address: if cloud
  save is on, a mail service sends the sign-in link, so it sees that email
  address and nothing else. When no mail service is configured the feature simply
  cannot be switched on — the game says so rather than pretending.
- You can **export everything** and **delete everything**, at any time, and the
  delete is immediate and permanent.

## What is stored on your device

Whether or not you use cloud save, the game keeps this on the device:

- your child's chosen display name and their 4-digit PIN
- their progress: coins, stars, levels finished, owls helped
- how the maths is going: which topics are unlocked, roughly how hard the
  questions should be, and which ones are due for another look
- a short history of recent answers, used to decide what to ask next

**About that PIN: it is not a password, but it is checked.** It exists so two
children sharing one iPad can each find their own progress. The game does compare
what is typed against what was set, and answers a wrong one on screen — this page
said "the game does not check it against anything", which was simply false, and
`SECURITY.md` had it right all along.

What makes it not a password is everything else about it. It never leaves the
device and no server ever sees it. It is stored with a scramble that is reversible
by anyone who looks. And **anyone holding the device can bypass it** by clearing
the site's data, which starts the game over. So do not treat it as protecting
anything from a determined person — it is a "which kid am I" gate, not security.

**One consequence worth knowing before you set one:** there is no "forgot my PIN"
screen. A child who cannot remember theirs cannot get back into that player, and
the only way through is to clear the site's data, which erases the progress of
every player on the device. If that matters to you, pick a PIN the child will
remember or write it down somewhere.

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
about the device: screen size, browser language, whether the graphics and memory
features the game needs are present, which build was running, the **browser's
user-agent line**, and a **shortened form of your network address** — the first
three parts of it, with the rest dropped (`203.0.113.0/24`), which is enough to
notice one source flooding the endpoint and not enough to identify a household.
No progress, no answers, no score, and **never anything anyone typed into the
game** — not the display name, not the PIN, not a grown-up's email address. The
error report carries no child id, no display name and no typed text of any kind;
what it carries is listed below and nothing else. That is enforced by a test that
drives a real browser against the real endpoint on every build, not just by
intention.

What the report does carry is text the *game* produced about its own failure: the
error message, where in the code it came from, and a developer stack trace, all
described below.

(This paragraph said "no free text" until a review pointed out that the same page
describes "your child's chosen display name" two sections up. The claim worth
making is the narrow one, and it is the one the code actually enforces.)

Those full reports are kept for 30 days and then deleted automatically, by
dropping each day's table whole. What is kept longer is one entry per distinct
bug: how many times it happened, the error message and where in the code it came
from, the build it happened on, and one saved example of the coarse device facts
above with the developer stack trace. That is what makes a bug fixable months
later. It is not a per-child or per-family record and it is not tied to your
email, but it is more than a count, and the previous version of this page said it
was only a count.

## What we never collect

No real names. No ages or birthdays. No photos, audio, or video. No contacts. No
advertising identifiers. No cross-site tracking. No behavioural profiles. No data
sold or shared with anyone.

**No location.** The game never asks your device where it is. The shortened
network address on an error report is not used to work out where you are, and it
is deliberately cut short enough that it could not identify a household if it
were — but it is the one thing on this page that could be read as a location, so
it is named here rather than left to the list above.

The only personal detail we ask you for is the grown-up email address, and it is
used for exactly one thing: emailing you a sign-in link. It is stored in two
places for that purpose — against your family, and on the sign-in link itself
until the link is used or expires.

The shortened network address and the browser user-agent line are not asked for;
every web server receives them on every request. Where they are kept:

- **On error reports** — the shortened address and the user-agent line, for abuse
  triage, deleted with the rest of the report after 30 days.
- **On each device you sign in** — the user-agent line only, stored against the
  device so the device list can say "Safari on iPad" rather than an opaque id.
  There is no timer on this one: it lives as long as the device does, and is
  deleted when you remove the device or delete the family. An earlier version of
  this page said the user-agent was kept "on the error reports only", which was
  wrong.

## Keeping families apart

Everything about a **child** — their name in the game, their progress, every
answer — is fenced off inside the database itself, not just in the app's code. A
mistake in the application cannot make one family's child data visible to another;
the database refuses it rather than trusting the code to remember.

The **sign-in tables** work differently, and this page used to imply otherwise.
The grown-up email address, the list of devices, and the sign-in codes are not
fenced that way, because working out which family a device belongs to has to
happen *before* the family is known — the fence needs the answer that lookup
provides. Those tables are protected by the ordinary means: the query names the
row it wants, and nothing runs with more permission than it needs. It is a
weaker guarantee than the one above, on a smaller amount of data, and it is
better that you read it here than infer it from the paragraph that used to
overstate it.

## Getting your data, or deleting it

Both are available from the moment anything is stored, not as a later addition:

- **Export** — download everything held about your family as one file: the
grown-up email, each child, their saves and save history, every answer recorded,
the devices you have signed in, and the sync-conflict log. Two things are left
out and the file says so in its own `notIncluded` field: live session credentials
and in-flight sign-in codes, because handing those to whoever opens the file
would only widen the damage if it leaked. A test derives the family's table list
from the database and fails the build if a new one is neither exported nor named
there, so "everything" is checkable rather than a promise.
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
