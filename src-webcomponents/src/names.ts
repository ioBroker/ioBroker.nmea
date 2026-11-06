/**
 * The names of the components: the `name` of each manifest and the title of its dialogs.
 *
 * A name is the label of the native widget that shows the same - the devices widget
 * (`common.deviceWidgets.components[].label` in io-package.json) or the title of the vis-2 widget in the palette
 * (`src-widgets/src/i18n/<lang>.json`). vis-2 and devices then offer their own widget and leave the web component
 * out, other hosts show the web component. The build checks that they are still the same (`vite.config.ts`).
 *
 * Compass and rudder are windows of the vis-2 widget "Complex" (`tplNmeaComplex`) and have no native widget of
 * their own.
 */
import type { ComponentName } from './constants.ts';

export const NAMES: Record<ComponentName, ioBroker.Translated> = {
    wind: {
        en: 'NMEA Wind',
        de: 'NMEA-Wind',
        ru: 'NMEA Ветер',
        pt: 'Vento NMEA',
        nl: 'NMEA-wind',
        fr: 'Vent NMEA',
        it: 'Vento NMEA',
        es: 'Viento NMEA',
        pl: 'Wiatr NMEA',
        uk: 'NMEA Вітер',
        'zh-cn': 'NMEA 风',
    },
    'history-chart': {
        en: 'NMEA Chart',
        de: 'NMEA-Diagramm',
        ru: 'NMEA График',
        pt: 'Gráfico NMEA',
        nl: 'NMEA-grafiek',
        fr: 'Graphique NMEA',
        it: 'Grafico NMEA',
        es: 'Gráfico NMEA',
        pl: 'Wykres NMEA',
        uk: 'NMEA Графік',
        'zh-cn': 'NMEA 图表',
    },
    autopilot: {
        en: 'NMEA Autopilot',
        de: 'NMEA-Autopilot',
        ru: 'NMEA Автопилот',
        pt: 'Piloto automático NMEA',
        nl: 'NMEA-stuurautomaat',
        fr: 'Pilote automatique NMEA',
        it: 'Autopilota NMEA',
        es: 'Piloto automático NMEA',
        pl: 'Autopilot NMEA',
        uk: 'NMEA Автопілот',
        'zh-cn': 'NMEA 自动驾驶仪',
    },
    'ais-radar': {
        en: 'NMEA AIS Radar',
        de: 'NMEA-AIS-Radar',
        ru: 'NMEA AIS-радар',
        pt: 'Radar AIS NMEA',
        nl: 'NMEA AIS-radar',
        fr: 'Radar AIS NMEA',
        it: 'Radar AIS NMEA',
        es: 'Radar AIS NMEA',
        pl: 'Radar AIS NMEA',
        uk: 'NMEA AIS-радар',
        'zh-cn': 'NMEA AIS 雷达',
    },
    'anchor-position': {
        en: 'NMEA Anchor Position',
        de: 'NMEA-Ankerposition',
        ru: 'NMEA Позиция якоря',
        pt: 'Posição da âncora NMEA',
        nl: 'NMEA-ankerpositie',
        fr: "Position d'ancre NMEA",
        it: "Posizione dell'ancora NMEA",
        es: 'Posición del ancla NMEA',
        pl: 'Pozycja kotwicy NMEA',
        uk: 'NMEA Позиція якоря',
        'zh-cn': 'NMEA 锚位',
    },
    // the title of the vis-2 widget "Instrument" in the palette, as `src-widgets/src/i18n/` has it
    instrument: {
        en: 'Instrument',
        de: 'Instrument',
        ru: 'Инструмент',
        pt: 'Instrumento',
        nl: 'Instrument',
        fr: 'Instrument',
        it: 'Strumento',
        es: 'Instrumento',
        pl: 'Instrument',
        uk: 'Інструмент',
        'zh-cn': '乐器',
    },
    compass: {
        en: 'NMEA Compass',
        de: 'NMEA-Kompass',
        ru: 'NMEA Компас',
        pt: 'Bússola NMEA',
        nl: 'NMEA-kompas',
        fr: 'Compas NMEA',
        it: 'Bussola NMEA',
        es: 'Compás NMEA',
        pl: 'Kompas NMEA',
        uk: 'NMEA Компас',
        'zh-cn': 'NMEA 罗经',
    },
    rudder: {
        en: 'NMEA Rudder',
        de: 'NMEA-Ruder',
        ru: 'NMEA Руль',
        pt: 'Leme NMEA',
        nl: 'NMEA-roer',
        fr: 'Gouvernail NMEA',
        it: 'Timone NMEA',
        es: 'Timón NMEA',
        pl: 'Ster NMEA',
        uk: 'NMEA Кермо',
        'zh-cn': 'NMEA 舵',
    },
};
