import type { JSX } from 'react';

/** A sailing boat: the picture of the hint */
const SAILBOAT_PATH = 'M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z';

/**
 * A hint instead of the content: a setting is missing or names nothing that can be shown
 *
 * @param props the text and whether the host is in edit mode
 * @param props.text what to say
 * @param props.editMode in edit mode the element takes no clicks
 */
export function Hint({ text, editMode }: { text: string; editMode: boolean }): JSX.Element {
    return (
        <div className={`hint${editMode ? ' edit' : ''}`}>
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path d={SAILBOAT_PATH} />
            </svg>
            <span>{text}</span>
        </div>
    );
}
