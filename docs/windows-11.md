# Running kurtar on Windows 11

Everything here runs on Unix: the bring-up script is `bash`, the Docker
images are Linux, and the deployed servers are Linux. On Windows that means
**WSL2** — not PowerShell, not Git Bash, not `cmd`. WSL2 is not an extra
dependency you are being asked to install: Docker Desktop for Windows
already requires it, so a machine that meets this project's prerequisites
has it.

> **What has and has not been verified.** The Linux and macOS paths were
> tested by cloning fresh and running them. This page was **not** executed
> on a Windows machine — there wasn't one to hand. The line-ending problem
> in step 2 was reproduced and fixed for real (by cloning at
> `core.autocrlf=true`, which is what Git for Windows does); the rest is
> reasoned from how WSL2 works, so treat it as a careful guide rather than
> a transcript. If a step misbehaves, that is worth reporting, not working
> around.

## 1. Prepare WSL2

In PowerShell, as administrator:

```powershell
wsl --install -d Ubuntu
wsl --status          # should report WSL version 2
```

Then, in **Docker Desktop → Settings → Resources → WSL Integration**, turn
on integration for that Ubuntu distro. Without it, `docker` exists on
Windows but not inside WSL, and the bring-up fails at its first step.

Check from inside WSL (`wsl` in a terminal, or the Ubuntu app):

```bash
docker compose version    # must print v2.x
node -v                   # 20 or newer; install inside WSL, not on Windows
```

Node installed on Windows is not the same Node as the one inside WSL. Use
[nvm](https://github.com/nvm-sh/nvm) inside WSL, or `apt` from NodeSource.

## 2. Clone INSIDE the WSL filesystem

```bash
cd ~                                   # this is /home/<you>, inside WSL
git clone https://github.com/mtarikucar/kurtar.git
cd kurtar
```

Two reasons this matters, and neither is cosmetic:

- **Speed.** A clone under `/mnt/c/...` is on the Windows filesystem,
  reached over a translation layer. `npm install` on this project writes
  tens of thousands of files; on `/mnt/c` that is minutes of overhead per
  command, and the file-watching the dev servers rely on is unreliable.
- **Line endings.** Git for Windows defaults to `core.autocrlf=true`, which
  rewrites text files to CRLF on checkout. `bash` cannot run a CRLF script:
  it fails with `$'\r': command not found`, which says nothing about the
  real cause. The repo now carries a `.gitattributes` that pins `eol=lf`,
  so this is handled — but cloning inside WSL keeps you away from the whole
  class of problem.

If you already cloned on the Windows side, re-clone inside WSL rather than
copying the directory across.

## 3. Bring it up

```bash
./scripts/dev-up.sh
curl http://localhost:4750/api/health/ready
# {"status":"ready","database":"up"}
```

Use `/api/health/ready`, not `/api/health` — the latter answers `ok` even
when the database is down, because it is a liveness probe for an
orchestrator, not a check that your setup worked.

WSL2 forwards `localhost` from Windows into the distro, so the merchant
panel (`http://localhost:5173`), the admin panel (`:5174`) and the landing
site (`:3000`) all open in a normal Windows browser while the servers run
inside WSL.

## 4. Seeing the app the way it is meant to be seen

The demo bags are **day-scoped** and open 19:00–21:00 Istanbul time. At any
other hour every shop is correctly shut — that is the app telling the
truth, not an empty database. To see the evening without waiting for it,
pin the clock at build time; `docs/consumer-on-a-phone.md` §0 has the flags
and the exact instant to use.

## 5. Putting it on a phone from a Windows host

The consumer app is React Native; the browser build is a review surface,
not the product. `docs/consumer-on-a-phone.md` covers this, with one extra
wrinkle on Windows:

**The phone cannot reach the WSL VM's own IP address.** WSL2 sits behind a
virtual switch, so `ip addr` inside the distro reports an address that
exists only on the host. What the phone needs is the **Windows machine's**
LAN address:

```bash
# from inside WSL:
powershell.exe -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp).IPAddress"
```

and then a port proxy so traffic arriving at Windows reaches WSL, plus a
firewall rule to let it in. In PowerShell **as administrator**:

```powershell
$wsl = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenport=4750 listenaddress=0.0.0.0 connectport=4750 connectaddress=$wsl
New-NetFirewallRule -DisplayName "kurtar api 4750" -Direction Inbound -LocalPort 4750 -Protocol TCP -Action Allow
```

Then build the app against `http://<windows-lan-ip>:4750` — the **origin
only, no `/api` suffix**; the client appends it, and with the suffix every
request 404s in a way that surfaces only as "the login button does
nothing".

To undo the proxy later:

```powershell
netsh interface portproxy delete v4tov4 listenport=4750 listenaddress=0.0.0.0
Remove-NetFirewallRule -DisplayName "kurtar api 4750"
```

**The WSL IP changes on reboot**, so the port proxy has to be re-pointed
after restarting. If you are only reviewing the design rather than testing
on a phone, skip all of this and use the browser build over `localhost`.

## 6. What will not work on Windows at all

- **iOS.** It cannot be built or simulated outside macOS. Android via EAS
  Build works from anywhere, because the build runs on Expo's servers —
  see `docs/consumer-on-a-phone.md` §3.
- **PowerShell as the shell.** There is no `.ps1` equivalent of
  `dev-up.sh`, and adding one that drifts from the bash version would be
  worse than not having it.
