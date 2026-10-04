function createBalanceStore(ctx) {
      const IDLE = { state: 'idle' }
      let snapshot = { status: 'starting', attempt: null, remote: false, waiting: true, read: IDLE }
      let revision = 0
      let reading = null
      const listeners = new Set()
      /** When this store began looking for the account namespace. */
      const lookedAt = Date.now()
      /** How long "still looking" is reported as an attempt rather than an absence. */
      const REACHABLE_WINDOW_MS = 20_000

      const publish = (next) => {
        snapshot = next
        for (const listener of listeners) listener()
      }

      /** Update only the connection half of the snapshot. */
      const publishConnection = (patch) => {
        publish({ ...snapshot, ...patch })
      }

      /** Optional services must be resolved individually through Cordis's public lookup. */
      const accountServices = () => {
        const remote = ctx.get('remote')
        const api = ctx.get('remote.account')
        return typeof remote?.$stream === 'function'
          && typeof api?.getBalance === 'function'
          && typeof api?.watch === 'function'
          ? { remote, api }
          : null
      }

      const clientMetadata = () => ({
        version: '0.2.0-rc.2',
        locale: ctx.locale.getSnapshot().active,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })

      /** Read the wallet summary once; concurrent callers share the in-flight read. */
      const read = () => {
        if (reading !== null) return reading
        if (snapshot.status !== 'credential-stored') return Promise.resolve()
        const services = accountServices()
        if (services === null) {
          publish({ ...snapshot, read: { state: 'failed', reason: 'no-account-service' } })
          return Promise.resolve()
        }
        const generation = revision
        const keeping = snapshot.read.state === 'ready' ? snapshot.read : { state: 'reading' }
        publish({ ...snapshot, read: keeping })
        const request = (async () => {
          const failed = (reason) => publish({ ...snapshot, read: snapshot.read.state === 'ready' ? { ...snapshot.read, stale: true, failure: reason } : { state: 'failed', reason } })
          try {
            const result = await services.api.getBalance(clientMetadata())
            if (generation !== revision) return
            if (result === null || typeof result !== 'object' || result.ok !== true) {
              failed('remote')
              return
            }
            const value = result.value ?? {}
            publish({
              ...snapshot,
              read: {
                state: 'ready',
                wallets: decorate(value.value),
                bonusWallets: decorate(value.bonusWallets),
                at: Date.now(),
              },
            })
          } catch {
            if (generation === revision) failed('threw')
          }
        })()
        reading = request
        const settle = () => { if (reading === request) reading = null }
        request.then(settle, settle)
        return request
      }

      /** Fold one account-state frame in and re-read whenever the credential can have changed. */
      const applyState = (view) => {
        const status = typeof view?.status === 'string' ? view.status : 'unknown'
        const previous = snapshot
        const signedInBefore = previous.status === 'credential-stored'
        const signedIn = status === 'credential-stored'
        if (!signedIn) { revision++; reading = null }
        publish({
          status,
          attempt: view?.attempt ?? null,
          remote: true,
          read: signedIn && signedInBefore ? previous.read : IDLE,
        })
        if (signedIn) void read()
      }

      /**
       * Own the account stream for this store's lifetime, waiting for the
       * namespace to appear and reconnecting if a stream instance ends.
       *
       * @returns disposer that stops the provider loop and the active stream.
       */
      const start = () => {
        let disposed = false
        let retryTimer = null
        let attempt = 0
        let everConnected = false
        let activeStream = null

        /** The retry cadence: quick while the page is still composing, then gentle. */
        const retryDelay = () => Math.min(500 * 2 ** Math.min(attempt, 5), 15_000)

        /** True while "no account API yet" should read as an attempt, not an absence. */
        const stillTrying = () => !everConnected && Date.now() - lookedAt < REACHABLE_WINDOW_MS

        const run = () => {
          if (disposed) return
          const services = accountServices()
          if (services === null) {
            publishConnection({ remote: false, waiting: stillTrying() })
            attempt += 1
            retryTimer = setTimeout(run, retryDelay())
            return
          }
          attempt = 0
          everConnected = true
          publishConnection({ remote: true, waiting: false })

          let stream = null
          const receive = async () => {
            try {
              for await (const frame of stream) {
                if (disposed) return
                applyState(frame.value)
                frame.accept()
              }
            } catch {
              /* the reconnect below owns the recovery */
            }
            if (activeStream === stream) activeStream = null
            if (disposed) return
            // The stream is over (or its opener threw). Wait, then take a fresh
            // one: a host-side reconnect must not leave a dead chip.
            publishConnection({ remote: false, waiting: true })
            if (retryTimer !== null) clearTimeout(retryTimer)
            retryTimer = setTimeout(run, retryDelay())
          }

          try {
            // The opener is invoked by the stream, so a throwing `watch()` lands
            // in `receive`'s catch instead of escaping the owning effect.
            stream = services.remote.$stream({
              name: NS,
              open: (signal) => services.api.watch(signal),
              ended: () => new Error('dsh-balance-chip: account stream ended'),
            })
            activeStream = stream
            void receive()
          } catch {
            publishConnection({ remote: false, waiting: true })
            retryTimer = setTimeout(run, retryDelay())
          }
        }

        run()

        // Safety net for a composition whose account stream stays silent.
        const poll = setInterval(() => {
          if (snapshot.status === 'credential-stored') void read()
        }, 60_000)

        return () => {
          disposed = true
          revision++
          clearInterval(poll)
          if (retryTimer !== null) clearTimeout(retryTimer)
          const stream = activeStream
          activeStream = null
          return stream?.dispose()
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getSnapshot() {
          return snapshot
        },
        start,
        reread: read,
      }
    }
