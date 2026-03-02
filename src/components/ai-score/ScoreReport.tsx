import React, { useEffect, useState, useRef } from 'react';
import { motion, useInView, animate } from 'framer-motion';

interface ScoreReportProps {
    score: number; // 0-100
    tier: string;
    tierColor: string;
    categories: { name: string; score: number; max: number }[];
    xp: number; // 0-100 progress to next tier
}

const ScoreReport: React.FC<ScoreReportProps> = ({ score, tier, tierColor, categories, xp }) => {
    const [displayScore, setDisplayScore] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { once: true, amount: 0.3 });

    useEffect(() => {
        if (isInView) {
            animate(0, score, {
                duration: 2,
                ease: "easeOut",
                onUpdate: (latest) => setDisplayScore(Math.round(latest))
            });
        }
    }, [isInView, score]);

    // Determine color based on resilience score
    const getScoreColor = (value: number) => {
        if (value >= 60) return '#4caf50'; // Green - Safe
        if (value >= 30) return '#ffeb3b'; // Yellow - At Risk
        return '#f44336'; // Red - Replaceable
    };

    const scoreColor = getScoreColor(displayScore);

    return (
        <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="score-report-card glass"
        >
            <div className="report-header">
                <h3 className="report-title">AI Resilience Analysis</h3>
                <div className="tier-badge" style={{ backgroundColor: `${tierColor}15`, color: tierColor, border: `1px solid ${tierColor}40` }}>
                    {tier}
                </div>
            </div>

            <div className="score-main">
                <div className="gauge-container">
                    <svg viewBox="0 0 100 100" className="circular-gauge">
                        <circle className="gauge-bg" cx="50" cy="50" r="45" />
                        <motion.circle
                            className="gauge-progress"
                            cx="50"
                            cy="50"
                            r="45"
                            stroke={scoreColor}
                            initial={{ strokeDashoffset: 283 }}
                            animate={isInView ? { strokeDashoffset: 283 - (283 * displayScore) / 100 } : { strokeDashoffset: 283 }}
                            transition={{ duration: 2, ease: "easeOut" }}
                        />
                    </svg>
                    <div className="gauge-value">
                        <span className="number" style={{ color: scoreColor }}>{displayScore}</span>
                        <span className="label">Resilience</span>
                    </div>
                </div>
                <div className="score-context">
                    <p className="context-text">
                        {score >= 60 ? "Your unique human traits strongly protect your market value." :
                            score >= 30 ? "Parts of your workflow are highly automatable. Upskilling recommended." :
                                "High risk of workflow automation. Urgent pivot to strategic roles advised."}
                    </p>
                </div>
            </div>

            <div className="categories-breakdown">
                <h4 className="categories-title">Attribute Analysis</h4>
                {categories.map((cat, idx) => (
                    <div key={idx} className="category-row">
                        <div className="category-labels">
                            <span className="category-name">{cat.name}</span>
                            <span className="category-value">{cat.score}/{cat.max}</span>
                        </div>
                        <div className="category-bar-bg">
                            <motion.div
                                className="category-bar-fill"
                                initial={{ width: 0 }}
                                animate={isInView ? { width: `${(cat.score / cat.max) * 100}%` } : { width: 0 }}
                                transition={{ duration: 1, delay: 0.5 + (idx * 0.1), ease: "easeOut" }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="xp-container">
                <div className="xp-labels">
                    <span className="xp-title">Evolution Progress</span>
                    <span className="xp-value">{Math.min(Number(xp) || 0, 100)}%</span>
                </div>
                <div className="xp-bar-bg">
                    <motion.div
                        className="xp-bar-fill"
                        initial={{ width: 0 }}
                        animate={isInView ? { width: `${Math.min(Number(xp) || 0, 100)}%` } : { width: 0 }}
                        transition={{ duration: 1.5, delay: 1 }}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default ScoreReport;
