import logger from '@wdio/logger'

import refetchElement from './utils/refetchElement'

const log = logger('webdriverio')

/**
 * This method is an command wrapper for elements that checks if a command is called
 * that wasn't found on the page and automatically waits for it
 *
 * @param  {Function} fn  commandWrap from wdio-sync package (or shim if not running in sync)
 */
export const elementErrorHandler = (fn) => (commandName, commandFn) => {
    return function (...args) {
        return fn(commandName, async () => {
            /**
             * wait on element if:
             *  - elementId couldn't be fetched in the first place
             *  - command is not explicit wait command for existance or displayedness
             */
            if (!this.elementId && !commandName.match(/(waitUntil|waitFor|isExisting|isDisplayed)/)) {
                log.debug(
                    `command ${commandName} was called on an element ("${this.selector}") ` +
                    'that wasn\'t found, waiting for it...'
                )

                /**
                 * create new promise so we can apply a custom error message in cases waitForExist fails
                 */
                try {
                    await this.waitForExist()
                    /**
                     * if waitForExist was successful requery element and assign elementId to the scope
                     */
                    const element = await this.parent.$(this.selector)
                    this.elementId = element.elementId
                } catch {
                    throw new Error(
                        `Can't call ${commandName} on element with selector "${this.selector}" because element wasn't found`)
                }
            }

            try {
                return await fn(commandName, commandFn).apply(this, args)
            } catch (error) {
                if (error.name === 'stale element reference') {
                    const element = await refetchElement(this)
                    this.elementId = element.elementId
                    this.parent = element.parent

                    return await fn(commandName, commandFn).apply(this, args)
                }
                throw error
            }
        }).apply(this)

    }
}

/**
 * handle single command calls from multiremote instances
 */
export const multiremoteHandler = (wrapCommand) => (commandName) => {
    return wrapCommand(commandName, function (...args) {
        const commandResults = this.instances.map((instanceName) => {
            return this[instanceName][commandName](...args)
        })

        return Promise.all(commandResults)
    })
}
