import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion } from 'framer-motion';

interface PokemonCardProps {
    name: string;
    title: string;
    photoUrl: string;
    type: string;
    hp: number;
    skills: string[];
    stats: {
        cognitiveDepth: number;
        decisionAutonomy: number;
        adaptability: number;
        systemLeverage: number;
    };
    powerUps: { name: string; desc: string }[];
    pokedexEntry: string;
    stage: string;
    primaryDomain: string;
    operatingMode: string;
    humanLeverage: string;
    replaceabilityScore?: number;
    replaceabilityTier?: string;
}

const PokemonCard = forwardRef<HTMLDivElement, PokemonCardProps>(({
    name, title, photoUrl, type, hp, skills, stats, powerUps, pokedexEntry, stage, primaryDomain, operatingMode, humanLeverage, replaceabilityScore, replaceabilityTier
}, ref) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [statColors, setStatColors] = useState<string[]>(['#111', '#111', '#111', '#111']);
    const [hasExtractedColors, setHasExtractedColors] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!photoUrl) return;

        const img = new Image();
        img.src = photoUrl;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                // Sample points from different quadrants to get diverse colors
                const samplePoints = [
                    { x: canvas.width * 0.25, y: canvas.height * 0.25 }, // Top Left
                    { x: canvas.width * 0.75, y: canvas.height * 0.25 }, // Top Right
                    { x: canvas.width * 0.25, y: canvas.height * 0.75 }, // Bottom Left
                    { x: canvas.width * 0.75, y: canvas.height * 0.75 }  // Bottom Right
                ];

                const colors = samplePoints.map(point => {
                    const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
                    let r = pixel[0], g = pixel[1], b = pixel[2];

                    // Convert to HSL briefly to ensure high saturation/lightness for "vibrant colorful bars"
                    r /= 255; g /= 255; b /= 255;
                    const cmin = Math.min(r, g, b), cmax = Math.max(r, g, b), delta = cmax - cmin;
                    let h = 0, s = 0, l = 0;
                    if (delta == 0) h = 0;
                    else if (cmax == r) h = ((g - b) / delta) % 6;
                    else if (cmax == g) h = (b - r) / delta + 2;
                    else h = (r - g) / delta + 4;
                    h = Math.round(h * 60);
                    if (h < 0) h += 360;
                    l = (cmax + cmin) / 2;
                    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

                    // Force vibrant colorful look, keeping lightness high enough to remain bright
                    s = Math.max(s, 0.75); // High saturation
                    l = Math.max(l, 0.65); // Bright pastel lightness to keep text readable

                    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
                    let r1 = 0, g1 = 0, b1 = 0;
                    if (0 <= h && h < 60) { r1 = c; g1 = x; b1 = 0; }
                    else if (60 <= h && h < 120) { r1 = x; g1 = c; b1 = 0; }
                    else if (120 <= h && h < 180) { r1 = 0; g1 = c; b1 = x; }
                    else if (180 <= h && h < 240) { r1 = 0; g1 = x; b1 = c; }
                    else if (240 <= h && h < 300) { r1 = x; g1 = 0; b1 = c; }
                    else if (300 <= h && h < 360) { r1 = c; g1 = 0; b1 = x; }
                    const finalR = Math.round((r1 + m) * 255), finalG = Math.round((g1 + m) * 255), finalB = Math.round((b1 + m) * 255);

                    return `rgb(${finalR}, ${finalG}, ${finalB})`;
                });

                if (colors.length === 4) {
                    setStatColors(colors);
                    setHasExtractedColors(true);
                }

            } catch (e) {
                console.warn("Could not extract colors, falling back to defaults.", e);
            }
        };

    }, [photoUrl]);

    const getTypeColor = (t: string) => {
        switch (t.toLowerCase()) {
            case 'creative': return 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)';
            case 'engineering': return 'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)';
            case 'strategy': return 'linear-gradient(to right, #fa709a 0%, #fee140 100%)';
            default: return 'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)';
        }
    };

    const baseGradient = getTypeColor(type);

    const isColorCloseToYellow = (rgbStr: string) => {
        const match = rgbStr.match(/\d+/g);
        if (!match) return false;
        const r = parseInt(match[0], 10);
        const g = parseInt(match[1], 10);
        const b = parseInt(match[2], 10);
        // Yellow is roughly high R, high G, low B
        return r > 180 && g > 180 && b < 100;
    };

    // Swap primary and secondary colors if the primary color causes the yellow stars to blend in completely
    const shouldSwapColors = hasExtractedColors && isColorCloseToYellow(statColors[0]);
    const safeColor0 = shouldSwapColors ? statColors[1] : statColors[0];
    const safeColor1 = shouldSwapColors ? statColors[0] : statColors[1];

    const typeGradient = hasExtractedColors
        ? `linear-gradient(135deg, ${safeColor0} 0%, ${safeColor1} 50%, ${statColors[2]} 100%)`
        : baseGradient;

    // Helper to extract rgb values and darken them for the white background on the back of the card
    const darkenRgbString = (rgbStr: string) => {
        const match = rgbStr.match(/\d+/g);
        if (!match) return rgbStr;
        const r = Math.floor(parseInt(match[0], 10) * 0.6);
        const g = Math.floor(parseInt(match[1], 10) * 0.6);
        const b = Math.floor(parseInt(match[2], 10) * 0.6);
        return `rgb(${r}, ${g}, ${b})`;
    };
    const darkStatColors = statColors.map(darkenRgbString);

    return (
        <div ref={ref} className="pokemon-card-container" onClick={() => setIsFlipped(!isFlipped)}>
            <motion.div
                className="pokemon-card-inner"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Front */}
                <div className="pokemon-card-front" style={{ background: typeGradient }}>
                    <div className="card-foil-overlay"></div>
                    <div className="card-shine-sweep"></div>
                    <div className="card-sparkle-overlay"></div>

                    <div className="card-header">
                        <div className="card-stage">{replaceabilityTier ? replaceabilityTier.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim().toUpperCase() : stage.toUpperCase()}</div>
                        <h2 className="card-name" style={{
                            fontSize: name.length > 20 ? '1rem' : name.length > 12 ? '1.3rem' : '1.8rem',
                            lineHeight: 1.1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                        }}>{name}</h2>
                        <div className="card-hp">
                            <span className="hp-label">RESILIENCE</span>
                            <span className="hp-value">{replaceabilityScore ? 100 - replaceabilityScore : hp}</span>
                            <div className="type-icon">{type === 'Creative' ? '✨' : type === 'Engineering' ? '⚙️' : '🧠'}</div>
                        </div>
                    </div>

                    <div className="card-image-container">
                        <div className="card-image-bg">
                            {photoUrl ? (
                                <img ref={imgRef} src={photoUrl} alt={name} className="card-photo" />
                            ) : (
                                <div className="card-photo-placeholder">👤</div>
                            )}
                        </div>
                        <div className="card-title-bar" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', fontSize: '0.55rem', padding: '4px', textAlign: 'center', lineHeight: '1.2' }}>
                            <span style={{ fontWeight: 800, fontStyle: 'italic', width: '100%', marginBottom: '1px', fontSize: '0.65rem' }}>{title.toUpperCase()}</span>
                            <span>PRIMARY DOMAIN: {primaryDomain.toUpperCase()}</span> |
                            <span>OPERATING MODE: {operatingMode.toUpperCase()}</span> |
                            <span>HUMAN LEVERAGE: {humanLeverage.toUpperCase()}</span>
                        </div>
                    </div>

                    <div className="card-skills-section" style={{ padding: '8px 0', minHeight: '40px' }}>
                        <div className="skills-row">
                            {skills.slice(0, 4).map((skill, i) => (
                                <span key={i} className="skill-chip" style={{ fontSize: '0.65rem', padding: '4px 10px', margin: '2px' }}>{skill}</span>
                            ))}
                        </div>
                    </div>

                    <div className="card-powerups-section">
                        {powerUps.map((pu, i) => (
                            <div key={i} className="powerup-row">
                                <div className="powerup-cost">
                                    <span className="energy-icon">⭐</span>
                                    {i === 1 && <span className="energy-icon">⭐</span>}
                                </div>
                                <div className="powerup-details" style={{ flex: 1, overflow: 'hidden' }}>
                                    <div className="powerup-name" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{pu.name}</div>
                                    <div className="powerup-desc" style={{
                                        fontSize: '0.65rem',
                                        lineHeight: 1.2,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>{pu.desc}</div>
                                </div>
                                <div className="powerup-damage">{(pu.name.length * 7 % 40) + 20}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card-stats-bottom" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                        <div className="stat-weakness">Automation Vulnerability<br /><span>⚠️ Low</span></div>
                        <div className="stat-resistance">Context Advantage<br /><span>♻️ High</span></div>
                        <div className="stat-retreat">Upgrade Cost<br /><span>⬆️ 2 XP</span></div>
                    </div>

                    <div style={{ textAlign: 'center', fontSize: '0.45rem', opacity: 0.4, fontWeight: 700, marginTop: 'auto', paddingTop: '2px' }}>
                        brainpuddle.com © 2026
                    </div>

                </div>

                {/* Back */}
                <div className="pokemon-card-back" style={{ background: typeGradient }}>
                    <div className="card-foil-overlay"></div>
                    <div className="back-content-wrapper glass">
                        <div className="pokeball-decoration"></div>
                        <img src="/logo.png" alt="" style={{ position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)', width: '60%', opacity: 0.08, pointerEvents: 'none', filter: 'grayscale(100%)' }} />
                        <h3 className="back-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>AI Resilience Score</span>
                            <span style={{ fontSize: '1.4rem', color: '#111' }}>{replaceabilityScore ? 100 - replaceabilityScore : 100}/100</span>
                        </h3>
                        <div className="pokedex-text">
                            {pokedexEntry}
                        </div>

                        <h4 className="back-subtitle">Base Stats</h4>
                        <div className="back-stats-grid" style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
                            <div className="back-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ width: '45%', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1.1, textAlign: 'left' }}>Cognitive<br />Depth</span>
                                <div className="stat-bar-container" style={{ width: '55%', background: 'rgba(0,0,0,0.08)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div className="stat-bar" style={{ width: `${stats.cognitiveDepth}%`, background: darkStatColors[0], height: '100%', borderRadius: '4px', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}></div>
                                </div>
                            </div>
                            <div className="back-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ width: '45%', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1.1, textAlign: 'left' }}>Decision<br />Autonomy</span>
                                <div className="stat-bar-container" style={{ width: '55%', background: 'rgba(0,0,0,0.08)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div className="stat-bar" style={{ width: `${stats.decisionAutonomy}%`, background: darkStatColors[1], height: '100%', borderRadius: '4px', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}></div>
                                </div>
                            </div>
                            <div className="back-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ width: '45%', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1.1, textAlign: 'left' }}>Adaptability</span>
                                <div className="stat-bar-container" style={{ width: '55%', background: 'rgba(0,0,0,0.08)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div className="stat-bar" style={{ width: `${stats.adaptability}%`, background: darkStatColors[2], height: '100%', borderRadius: '4px', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}></div>
                                </div>
                            </div>
                            <div className="back-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ width: '45%', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1.1, textAlign: 'left' }}>System<br />Leverage</span>
                                <div className="stat-bar-container" style={{ width: '55%', background: 'rgba(0,0,0,0.08)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div className="stat-bar" style={{ width: `${stats.systemLeverage}%`, background: darkStatColors[3], height: '100%', borderRadius: '4px', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="back-footer">
                            brainpuddle.com © 2026
                        </div>
                    </div>
                </div>

            </motion.div>
        </div>
    );
});

export default PokemonCard;
