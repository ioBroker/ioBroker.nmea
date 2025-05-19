import React, { useEffect, useState } from 'react';
import { useTheme } from '@mui/material';

export const RADIUS = 250;

export function polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number,
): { x: number; y: number } {
    const returnValue: { x: number; y: number } = { x: 0, y: 0 };
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    returnValue.x = Math.round((centerX + radius * Math.cos(angleInRadians)) * 100) / 100;
    returnValue.y = Math.round((centerY + radius * Math.sin(angleInRadians)) * 100) / 100;
    return returnValue;
}

export function closestEquivalentAngle(from: number, to: number): number {
    const delta = ((((to - from) % 360) + 540) % 360) - 180;
    return from + delta;
}

export function getArcPath(
    x: number,
    y: number,
    radius: number,
    angleStart: number,
    angleEnd: number,
    thickness: number,
    cutLength: number,
    cutDepth: number,
    flat?: boolean,
): string {
    const radiusIn = radius - thickness;
    const angleLength = angleEnd - angleStart;
    const pOut1 = polarToCartesian(x, y, radius, angleStart);
    const pOut2 = polarToCartesian(x, y, radius, angleEnd);
    const pIn2 = polarToCartesian(x, y, radiusIn, angleEnd);
    const pCut3 = polarToCartesian(x, y, radiusIn, angleStart + angleLength / 2 + cutLength);
    const pCut2 = polarToCartesian(x, y, radius - thickness + cutDepth, angleStart + angleLength / 2);
    const pCut1 = polarToCartesian(x, y, radiusIn, angleStart + angleLength / 2 - cutLength);
    const pIn1 = polarToCartesian(x, y, radiusIn, angleStart);

    return (
        `M${pOut1.x} ${pOut1.y}A${radius} ${radius} 0 0 1 ${pOut2.x} ${pOut2.y}${
            flat ? `L${pIn2.x} ${pIn2.y}` : `A${thickness / 2} ${thickness / 2} 0 0 1 ${pIn2.x} ${pIn2.y}`
        }A${radiusIn} ${radiusIn} 0 0 0 ${pCut3.x} ${pCut3.y}` +
        `L${pCut2.x} ${pCut2.y}` +
        `L${pCut1.x} ${pCut1.y}` +
        `A${radiusIn} ${radiusIn} 0 0 0 ${pIn1.x} ${pIn1.y}${
            flat ? `L${pOut1.x} ${pOut1.y}` : `A${thickness / 2} ${thickness / 2} 0 0 1 ${pOut1.x} ${pOut1.y}Z`
        }`
    );
}

export function Arc(props: {
    color: string;
    x: number;
    y: number;
    radius: number;
    angleStart: number;
    angleEnd: number;
    flat?: boolean;
}): React.JSX.Element {
    return (
        <path
            fill={props.color}
            d={getArcPath(
                props.x,
                props.y,
                props.radius,
                props.angleStart,
                props.angleEnd,
                20,
                props.flat ? 0 : 4,
                props.flat ? 0 : 10,
                props.flat,
            )}
        />
    );
}

export function Line(props: {
    color?: string;
    factor?: number;
    paddingCallback?: (angle: number) => number;
    angle: number;
    x: number;
    y: number;
    radius: number;
    width?: number;
}): React.JSX.Element {
    const theme = useTheme();
    const fill = theme.palette.background.default;
    const stroke = props.color || theme.palette.text.primary;
    let padding = 0;
    const factor = props.factor || 1;
    if (props.paddingCallback) {
        padding = props.paddingCallback(props.angle);
    } else {
        padding = props.angle % 30 ? 0 : 20;
    }
    const coord1 = polarToCartesian(props.x, props.y, props.radius - (20 + padding), props.angle * factor);
    const coord2 = polarToCartesian(props.x, props.y, props.radius, props.angle * factor);
    return (
        <line
            style={{
                fill,
                stroke,
                strokeWidth: props.width || 1,
            }}
            x1={coord1.x}
            y1={coord1.y}
            x2={coord2.x}
            y2={coord2.y}
        />
    );
}

export function Ship(props: { style?: React.CSSProperties }): React.JSX.Element {
    return (
        <path
            // onClick={() => console.log('click')}
            d="M -20 10 L -20 -10 C -20 -10 -20 -30 0 -50 C 20 -30 20 -10 20 -10 L 20 10 C 20 30 20 30 16 50 C 0 54 0 54 -16 50 C -20 30 -20 30 -20 10 Z"
            stroke="#FF0000"
            strokeWidth="0.1"
            fill="green"
            {...props}
        />
    );
}

export function SvgContainer(props: {
    zIndex?: number;
    containerStyle?: React.CSSProperties;
    width?: number;
    height?: number;
    angle?: number;
    scale?: number;
    noAnimation?: boolean;
    style?: React.CSSProperties;
    className?: string;
    preserveAspectRatio?: string;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: props.zIndex,
                pointerEvents: 'none',
                ...props.containerStyle,
            }}
        >
            <svg
                viewBox={`0 0 ${(props.width || RADIUS) * 2} ${(props.height || RADIUS) * 2}`}
                xmlns="http://www.w3.org/2000/svg"
                style={{
                    transform: `rotate(${props.angle || 0}deg) scale(${props.scale || 1})`,
                    transition:
                        !props.noAnimation && props.angle !== null && props.angle !== undefined
                            ? 'transform 0.5s linear'
                            : 'none',
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                    padding: 10,
                    boxSizing: 'border-box',
                    ...props.style,
                }}
                className={props.className}
                preserveAspectRatio={props.preserveAspectRatio}
            >
                {props.children}
            </svg>
        </div>
    );
}

export function BigArrow(props: { angle: number; zIndex?: number }): React.JSX.Element {
    return (
        <SvgContainer
            angle={props.angle}
            zIndex={props.zIndex}
        >
            <path
                d="M 0 20 L -10 -10 L 0 -20 L 10 -10 L 0 20 Z"
                stroke="#FFFF00"
                strokeWidth="0.1"
                fill="#FFFF00"
                opacity={0.7}
                style={{ transform: `translate(${RADIUS}px, ${RADIUS - 140}px) scale(3)` }}
            />
            <text
                style={{
                    whiteSpace: 'pre',
                    // fill: stroke,
                    fontFamily: 'Arial, sans-serif',
                    fontSize: `${RADIUS / 10}px`,
                    transform: `translate(${RADIUS}px, ${RADIUS - 150}px)`,
                }}
                x={0}
                y={0}
                dominantBaseline="central"
                textAnchor="middle"
            >
                T
            </text>
        </SvgContainer>
    );
}

export function SmallArrow(props: { angle: number; zIndex?: number }): React.JSX.Element {
    return (
        <SvgContainer
            angle={props.angle}
            zIndex={props.zIndex}
        >
            <path
                d="M 0 20 C 0 20 20 -20 0 -20 C -20 -20 0 20 0 20 Z"
                stroke="#FFA500"
                strokeWidth="0.1"
                fill="#FFA500"
                style={{ transform: `translate(${RADIUS}px, ${RADIUS - 160}px)` }}
            />
            <text
                style={{
                    whiteSpace: 'pre',
                    // fill: stroke,
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '13.9px',
                    transform: `translate(${RADIUS}px, ${RADIUS - 170}px)`,
                }}
                x={0}
                y={0}
                dominantBaseline="central"
                textAnchor="middle"
            >
                A
            </text>
        </SvgContainer>
    );
}

export function Text(props: {
    color?: string;
    factor?: number;
    paddingCallback?: (angle: number) => number;
    angle: number;
    radius: number;
    x: number;
    y: number;
    noRotate?: boolean;
    textRotate?: number;
    text: string;
}): React.JSX.Element {
    const theme = useTheme();
    // const fill = theme.palette.background.default;
    const stroke = props.color || theme.palette.text.primary;
    let padding: number;
    const factor = props.factor || 1;
    if (props.paddingCallback) {
        padding = props.paddingCallback(props.angle);
    } else {
        padding = props.angle % 30 ? 0 : 20;
    }
    const coord = polarToCartesian(props.x, props.y, props.radius - (40 + padding), props.angle * factor);
    return (
        <text
            style={{
                whiteSpace: 'pre',
                fill: stroke,
                fontFamily: 'Arial, sans-serif',
                fontSize: `${Math.round(RADIUS / 10)}px`,
            }}
            x={coord.x}
            y={coord.y}
            dominantBaseline="central"
            transform={
                props.noRotate ? undefined : `rotate(${props.textRotate || props.angle * factor} ${coord.x} ${coord.y})`
            }
            textAnchor="middle"
        >
            {props.text}
        </text>
    );
}

export function Lines(props: {
    getAngles?: () => number[];
    factor?: number;
    marks?: { angle: number; width?: number; color?: string }[];
    textCallback: (angle: number) => number | 'N' | 'O' | 'S' | 'W' | '';
    radius?: number;
    paddingCallback?: (angle: number) => number;
    width?: number;
    color?: string;
    noRotateText?: boolean;
    textRotate?: number;
}): React.JSX.Element[] {
    let angles: number[] = [];
    if (props.getAngles) {
        angles = props.getAngles();
    } else {
        for (let i = 0; i < 360; i += 10) {
            angles.push(i);
        }
    }

    const factor = props.factor || 1;

    return angles.map(angle => {
        const specialMark = props.marks?.find(a => a.angle === angle);
        const label = props.textCallback(angle);
        return (
            <React.Fragment key={angle}>
                <Line
                    x={RADIUS}
                    y={RADIUS}
                    radius={props.radius || RADIUS}
                    angle={angle}
                    factor={factor}
                    paddingCallback={props.paddingCallback}
                    width={specialMark?.width || props.width || 1}
                    color={specialMark?.color || props.color}
                />
                {label ? (
                    <Text
                        x={RADIUS}
                        y={RADIUS}
                        radius={props.radius || RADIUS - 10}
                        angle={angle}
                        factor={factor}
                        text={label.toString()}
                        paddingCallback={props.paddingCallback}
                        noRotate={props.noRotateText}
                        textRotate={props.textRotate}
                        color={props.color}
                    />
                ) : null}
            </React.Fragment>
        );
    });
}

export function CenterText(props: {
    style?: React.CSSProperties;
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element {
    return (
        <SvgContainer angle={0}>
            <foreignObject
                x={0}
                y={0}
                width={RADIUS * 2}
                height={RADIUS * 2}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                    }}
                >
                    <div
                        style={{ textAlign: 'center', ...props.style }}
                        className={props.className}
                    >
                        {props.children}
                    </div>
                </div>
            </foreignObject>
        </SvgContainer>
    );
}

export function Rudder(props: { y?: number; rudder?: number }): React.JSX.Element {
    const theme = useTheme();
    const fill = theme.palette.background.default;
    const stroke = theme.palette.text.primary;
    const marks: number[] = [];
    for (let i = -50; i <= 50; i += 10) {
        marks.push(i);
    }

    const y = props.y !== undefined ? props.y : RADIUS * 2 + 10;

    return (
        <>
            <rect
                y={y}
                width={RADIUS * 2}
                height={30}
                fill={fill}
                stroke={stroke}
            />
            {props.rudder !== undefined && props.rudder !== null ? (
                <rect
                    x={Math.min(RADIUS)}
                    y={y}
                    height={30}
                    fill="blue"
                    style={{
                        width: 1,
                        transition: 'all 0.5s linear',
                        transform: `scaleX(${props.rudder * 5})`,
                        transformBox: 'content-box',
                    }}
                />
            ) : null}
            {marks.map(mark => (
                <line
                    key={mark}
                    x1={RADIUS + mark * 5}
                    y1={y}
                    x2={RADIUS + mark * 5}
                    y2={y + 30}
                    stroke={stroke}
                />
            ))}
            {marks.map(mark => {
                const markAngle = mark < 0 ? -1 * mark : mark;
                let markText: string;
                if (markAngle === 50) {
                    markText = '';
                } else {
                    markText = `${markAngle}°`;
                }
                return (
                    <text
                        key={`text-${mark}`}
                        // x={RADIUS + mark * 5}
                        // y={RADIUS * 2 + 50}
                        dominantBaseline="central"
                        textAnchor="middle"
                        style={{
                            whiteSpace: 'pre',
                            fill: stroke,
                            fontFamily: 'Arial, sans-serif',
                            fontSize: `${Math.round(RADIUS * 0.08)}px`,
                            transform: `translate(${RADIUS + mark * 5}px, ${y + 45}px)`,
                        }}
                    >
                        {markText}
                    </text>
                );
            })}
        </>
    );
}

export function useAngle(newAngle?: number): number {
    const [angle, setAngle] = useState(newAngle || 0);
    useEffect(() => {
        setAngle(_angle => closestEquivalentAngle(_angle, newAngle || 0) || 0);
    }, [newAngle]);

    return angle;
}
