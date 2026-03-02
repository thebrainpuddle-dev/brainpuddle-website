import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const HeroSection: React.FC = () => {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: "easeOut" as const }
        }
    };

    return (
        <section className="hero-section">
            <motion.div
                className="hero-content"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants} className="hero-announcement-banner">
                    <Link to="/ai-score" className="announcement-link">
                        <span className="announcement-badge">NEW</span>
                        <span className="announcement-text">Test your AI Resilience with our gamified scanner </span>
                        <span className="announcement-arrow">→</span>
                    </Link>
                </motion.div>

                <motion.div variants={itemVariants} className="hero-badge">
                    The AI studio for builders
                </motion.div>
                <motion.h1 variants={itemVariants} className="hero-title">
                    Your next breakthrough<br />starts <span>here.</span>
                </motion.h1>
                <motion.p variants={itemVariants} className="hero-subtitle">
                    Exploring intelligence across domains, systems and dimensions.
                </motion.p>
                <motion.div variants={itemVariants} className="hero-actions">
                    <button className="btn-primary" onClick={() => document.getElementById('what-we-do')?.scrollIntoView({ behavior: 'smooth' })}>See What We Build</button>
                </motion.div>
            </motion.div>
        </section>
    );
};

export default HeroSection;
