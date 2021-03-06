'use strict';

define('hooks', [], () => {
	const Hooks = {
		loaded: {},
		temporary: new Set(),
	};

	Hooks.register = (hookName, method) => {
		Hooks.loaded[hookName] = Hooks.loaded[hookName] || new Set();
		Hooks.loaded[hookName].add(method);
		console.debug(`[hooks] Registered ${hookName}`, method);
	};
	Hooks.on = Hooks.register;

	// registerPage/onPage takes care of unregistering the listener on ajaxify
	Hooks.registerPage = (hookName, method) => {
		Hooks.temporary.add({ hookName, method });
		Hooks.register(hookName, method);
	};
	Hooks.onPage = Hooks.registerPage;
	Hooks.register('action:ajaxify.start', () => {
		Hooks.temporary.forEach((pair) => {
			Hooks.unregister(pair.hookName, pair.method);
			Hooks.temporary.delete(pair);
		});
	});

	Hooks.unregister = (hookName, method) => {
		if (Hooks.loaded[hookName] && Hooks.loaded[hookName].has(method)) {
			Hooks.loaded[hookName].delete(method);
			console.debug(`[hooks] Unregistered ${hookName}`, method);
		} else {
			console.debug(`[hooks] Unregistration of ${hookName} failed, passed-in method is not a registered listener or the hook itself has no listeners, currently.`);
		}
	};
	Hooks.off = Hooks.unregister;

	Hooks.hasListeners = hookName => Hooks.loaded[hookName] && Hooks.loaded[hookName].size > 0;

	const _onHookError = (e, listener, data) => {
		console.warn(`[hooks] Exception encountered in ${listener.name ? listener.name : 'anonymous function'}, stack trace follows.`);
		console.error(e);
		return Promise.resolve(data);
	};

	const _fireFilterHook = (hookName, data) => {
		if (!Hooks.hasListeners(hookName)) {
			return Promise.resolve(data);
		}

		const listeners = Array.from(Hooks.loaded[hookName]);
		return listeners.reduce((promise, listener) => promise.then((data) => {
			try {
				const result = listener(data);
				return utils.isPromise(result) ?
					result.then(data => Promise.resolve(data)).catch(e => _onHookError(e, listener, data)) :
					result;
			} catch (e) {
				return _onHookError(e, listener, data);
			}
		}), Promise.resolve(data));
	};

	const _fireActionHook = (hookName, data) => {
		if (!Hooks.hasListeners(hookName)) {
			return;
		}

		Hooks.loaded[hookName].forEach(listener => listener(data));

		// Backwards compatibility (remove this when we eventually remove jQuery from NodeBB core)
		$(window).trigger(hookName, data);
	};

	const _fireStaticHook = (hookName, data) => {
		if (!Hooks.hasListeners(hookName)) {
			return Promise.resolve(data);
		}

		const listeners = Array.from(Hooks.loaded[hookName]);
		return Promise.allSettled(listeners.map((listener) => {
			try {
				return listener(data);
			} catch (e) {
				return _onHookError(e, listener);
			}
		})).then(() => Promise.resolve(data));
	};

	Hooks.fire = (hookName, data) => {
		const type = hookName.split(':').shift();

		switch (type) {
			case 'filter':
				return _fireFilterHook(hookName, data);

			case 'action':
				return _fireActionHook(hookName, data);

			case 'static':
				return _fireStaticHook(hookName, data);
		}
	};

	return Hooks;
});
