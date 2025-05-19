import en from '../i18n/en.json';
import ru from '../i18n/ru.json';
import de from '../i18n/de.json';
import fr from '../i18n/fr.json';
import es from '../i18n/es.json';
import it from '../i18n/it.json';
import pt from '../i18n/pt.json';
import nl from '../i18n/nl.json';
import pl from '../i18n/pl.json';
import uk from '../i18n/uk.json';
import zh from '../i18n/zh-cn.json';

const words: { [word: string]: Record<ioBroker.Languages, string> } = {};

const languages: Record<ioBroker.Languages, Record<string, string>> = {
    en,
    ru,
    de,
    fr,
    es,
    it,
    pt,
    nl,
    pl,
    uk,
    'zh-cn': zh,
};

Object.keys(languages).forEach((lang: string) => {
    Object.keys(languages[lang as ioBroker.Languages]).forEach(word => {
        if (!words[word]) {
            words[word] = {} as Record<ioBroker.Languages, string>;
        }
        words[word][lang as ioBroker.Languages] = languages[lang as ioBroker.Languages][word];
    });
});

export default function t(word: string, lang: ioBroker.Languages, arg1?: any, arg2?: any): string {
    let text: string;
    if (words[word]) {
        text = words[word][lang] || words[word].en;
    } else {
        text = word;
    }
    text = text.replace('%s', arg1);
    text = text.replace('%s', arg2);

    return text;
}
