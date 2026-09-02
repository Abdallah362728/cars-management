// Sign-in / sign-up screen. Not in the router's PAGES map — main.js renders it
// directly when there is no session, because it gates the app rather than
// living inside it.

import { signIn, signUp } from '../../core/auth.js'
import { esc } from '../../domain/format.js'

const CAR_MARK = `
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#E8A33D" stroke-width="1.2" stroke-linecap="round">
    <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
    <path d="M5 17H3V11L5 6H19L21 11V17H19M9 17H15M9 11H19M9 11H5"/>
  </svg>`

const COPY = {
  signin: { sub: 'Sign in to continue', action: 'Sign in',      busy: 'Signing in…',
            swapText: 'New here?',            swapLink: 'Create an account' },
  signup: { sub: 'Create your garage',   action: 'Create account', busy: 'Creating…',
            swapText: 'Already have an account?', swapLink: 'Sign in' },
}

// `onSignedIn` re-runs the app's start sequence once a session exists.
export function renderLogin(container, onSignedIn, { message = '', mode = 'signin' } = {}) {
  const copy = COPY[mode]

  container.innerHTML = `
    <div class="center-screen" style="min-height:88dvh">
      <div style="width:100%;max-width:320px">
        <div style="text-align:center;margin-bottom:26px">
          ${CAR_MARK}
          <h1 style="font-size:19px;font-weight:600;margin-top:12px">Cars Manager</h1>
          <p class="micro" style="margin-top:6px">${copy.sub}</p>
        </div>

        <form id="login-form" class="form-stack" style="text-align:left">
          <div>
            <label class="micro">Email</label>
            <input type="email" name="email" autocomplete="username" inputmode="email" required autofocus>
          </div>
          <div>
            <label class="micro">Password</label>
            <input type="password" name="password" required
                   autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"
                   ${mode === 'signup' ? 'minlength="6"' : ''}>
            ${mode === 'signup' ? '<p class="micro" style="margin-top:6px;letter-spacing:0.04em;text-transform:none">At least 6 characters.</p>' : ''}
          </div>
          <p id="login-note" class="micro"
             style="letter-spacing:0.04em;text-transform:none;min-height:15px">${esc(message)}</p>
          <button type="submit" id="login-submit" class="btn btn--primary" style="width:100%">${copy.action}</button>
        </form>

        <p class="mute" style="font-size:11px;text-align:center;margin-top:18px;line-height:1.5">
          ${copy.swapText}
          <button type="button" id="login-swap" style="color:var(--amber);font-size:11px;text-decoration:underline">${copy.swapLink}</button>
        </p>

        <p class="mute" style="font-size:11px;text-align:center;margin-top:14px;line-height:1.5">
          Every account has its own garage —<br>row-level security keeps them apart.
        </p>
      </div>
    </div>`

  const form = container.querySelector('#login-form')
  const note = container.querySelector('#login-note')
  const btn = container.querySelector('#login-submit')

  note.style.color = message ? 'var(--danger)' : 'var(--ink-mute)'

  container.querySelector('#login-swap').addEventListener('click', () => {
    renderLogin(container, onSignedIn, { mode: mode === 'signin' ? 'signup' : 'signin' })
  })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(form)
    const email = String(fd.get('email')).trim()
    const password = String(fd.get('password'))

    note.textContent = ''
    btn.textContent = copy.busy
    btn.disabled = true

    try {
      if (mode === 'signup') {
        const session = await signUp(email, password)
        if (!session) {
          // Email confirmation is on for this project: the account exists but
          // can't sign in yet. Don't drop the user on a dead form.
          renderLogin(container, onSignedIn, {
            mode: 'signin',
            message: `Account created. Confirm ${email} from your inbox, then sign in.`,
          })
          const n = container.querySelector('#login-note')
          n.style.color = 'var(--ok)'
          return
        }
      } else {
        await signIn(email, password)
      }
      await onSignedIn()
    } catch (err) {
      note.style.color = 'var(--danger)'
      // Supabase says "Invalid login credentials" for both a wrong password and
      // an unknown email; anything else is worth showing verbatim.
      note.textContent = /invalid login credentials/i.test(err?.message ?? '')
        ? 'Wrong email or password.'
        : String(err?.message ?? err)
      btn.textContent = copy.action
      btn.disabled = false
      form.querySelector('input[name="password"]').select()
    }
  })
}
