/**
 * The base of the elements of the NMEA adapter, on top of `IobWebComponent` (`@iobroker/web-components`): a shadow
 * root with the styles of the component and a React root, the words in the language of the system, the decimal
 * separator and the default history instance of `system.config`, element dialogs and the timers a component needs.
 *
 * React is not in the modules: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { DIALOG_CLOSE_EVENT } from '@iobroker/web-components';
import { getThemeCssVariables, IobWebComponent } from '@iobroker/web-components/element';
import type { WebComponentSettings } from '@iobroker/web-components';

import { getWord, type WordKey } from './i18n';
import { BASE_STYLES } from './styles';

/** The object with the decimal separator and the default history instance */
export const SYSTEM_CONFIG = 'system.config';

export interface ElementDialogOptions {
    title: string;
    /** The styles of the shadow root of the dialog content */
    css: string;
    width?: number;
    height?: number;
    /** As high as the content, e.g. a question; else at least 60 % of the window */
    fit?: boolean;
    /**
     * The content, drawn again with every change of a state while the dialog is open
     *
     * @param close closes the dialog with this result
     */
    draw: (close: (detail?: unknown) => void) => ReactNode;
}

export abstract class NmeaElement<TSettings extends WebComponentSettings> extends IobWebComponent<TSettings> {
    readonly #root: Root;

    readonly #mount: HTMLDivElement;

    /** Draws the open dialogs again */
    readonly #dialogs = new Set<() => void>();

    #ticker: ReturnType<typeof setInterval> | null = null;

    #throttleTimer: ReturnType<typeof setTimeout> | null = null;

    #lastDraw = 0;

    /** Draw again this often (ms) while connected, e.g. for a chart that scrolls with the time; 0: never */
    protected tickMs = 0;

    /** Draw at most this often (ms), e.g. for many AIS targets; 0: at every change */
    protected throttleMs = 0;

    /**
     * @param css the styles of the component, after the shared ones
     */
    protected constructor(css: string) {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = BASE_STYLES + css;
        this.#mount = document.createElement('div');
        this.#mount.className = 'mount';
        shadow.append(style, this.#mount);
        this.#root = createRoot(this.#mount);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        if (this.tickMs && !this.#ticker) {
            this.#ticker = setInterval(() => {
                // nothing moves on a page in the background
                if (!document.hidden && this.isConnected) {
                    this.render();
                }
            }, this.tickMs);
        }
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this.#ticker) {
            clearInterval(this.#ticker);
            this.#ticker = null;
        }
        if (this.#throttleTimer) {
            clearTimeout(this.#throttleTimer);
            this.#throttleTimer = null;
        }
    }

    /** `system.config`: the decimal separator and the default history instance. Override and add to it */
    protected override getObjectIds(_settings: TSettings): (string | undefined | null)[] {
        return [SYSTEM_CONFIG];
    }

    /** True if the system writes `1,5` */
    protected get isFloatComma(): boolean {
        const config = this.objects[SYSTEM_CONFIG] as ioBroker.SystemConfigObject | null | undefined;
        return !!config?.common?.isFloatComma;
    }

    /** The history instance of the system, e.g. `history.0`; empty if there is none */
    protected get defaultHistory(): string {
        const config = this.objects[SYSTEM_CONFIG] as ioBroker.SystemConfigObject | null | undefined;
        return config?.common?.defaultHistory || '';
    }

    /** A word in the language of the system */
    protected word(key: WordKey): string {
        return getWord(this.systemLang, key);
    }

    /** The value of a subscribed state as a number, null without one */
    protected num(id: string | null | undefined): number | null {
        if (!id) {
            return null;
        }
        const val = this.states[id]?.val;
        if (val === null || val === undefined || val === '') {
            return null;
        }
        const n = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
        return Number.isFinite(n) ? n : null;
    }

    /** What the box shows; called after every change */
    protected abstract renderContent(): ReactNode;

    protected override render(): void {
        if (this.throttleMs) {
            const wait = this.#lastDraw + this.throttleMs - Date.now();
            if (wait > 0) {
                this.#throttleTimer ||= setTimeout(() => {
                    this.#throttleTimer = null;
                    if (this.isConnected) {
                        this.render();
                    }
                }, wait);
                return;
            }
        }
        this.#lastDraw = Date.now();
        // the colors of the dials differ a little on a light page
        this.#mount.classList.toggle('light', this.theme.type === 'light');
        this.#root.render(this.renderContent());
        for (const draw of this.#dialogs) {
            draw();
        }
    }

    /**
     * Show content of the component in an element dialog of the host; drawn again with every change
     *
     * @param options what to show
     * @returns the result of `close()`, null if the user closed the dialog otherwise
     */
    protected async showElementDialog(options: ElementDialogOptions): Promise<unknown> {
        if (this.editMode) {
            return null;
        }
        const element = document.createElement('div');
        element.style.width = '100%';
        element.style.height = '100%';
        const shadow = element.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = BASE_STYLES + options.css;
        const mount = document.createElement('div');
        mount.className = options.fit ? 'mount dialog fit' : 'mount dialog';
        shadow.append(style, mount);
        const root = createRoot(mount);
        const close = (detail: unknown = null): void => {
            element.dispatchEvent(new CustomEvent(DIALOG_CLOSE_EVENT, { detail, bubbles: true, composed: true }));
        };
        const draw = (): void => {
            // the host moves the content into its dialog, out of this element: it takes the theme along
            for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
                element.style.setProperty(name, value);
            }
            mount.classList.toggle('light', this.theme.type === 'light');
            root.render(options.draw(close));
        };
        this.#dialogs.add(draw);
        draw();
        try {
            return await this.openDialog({
                title: options.title,
                element,
                width: options.width,
                height: options.height,
            });
        } finally {
            this.#dialogs.delete(draw);
            root.unmount();
        }
    }
}
