import React from 'react';
import { motion } from 'framer-motion';

const results = [
    {
        name: "BookMyChef",
        stat: "10x",
        statDesc: "Faster Bookings",
        desc: "Implemented advanced Voice Agents for seamless user-chef matching. Transformed fragmented booking processes into automated, real-time voice coordination.",
        comingSoon: false
    },
    {
        name: "Upcoming Project Alpha",
        stat: "Q3",
        statDesc: "Launch target",
        desc: "Exciting new AI integration currently in stealth development. Revolutionizing the way businesses interact with data.",
        comingSoon: true
    },
    {
        name: "Upcoming Project Beta",
        stat: "Q4",
        statDesc: "Launch target",
        desc: "Web for AI Agents — a new kind of interface living at the intersection of HCI and Ambient Computing. Not an app, not a dashboard. Something in between.",
        comingSoon: true
    }
];

const partners = [
    {
        name: 'ElevenLabs',
        logo: (
            <svg viewBox="0 0 130 24" className="h-6 fill-current opacity-40 hover:opacity-100 transition-opacity duration-500">
                <path d="M4.6035 0v24h4.9317V0zm9.8613 0v24h4.9317V0z" />
                <text x="25" y="19" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="18" letterSpacing="-0.5">ElevenLabs</text>
            </svg>
        )
    },
    {
        name: 'Antigravity',
        logo: (
            <svg viewBox="0 0 160 24" className="h-6 fill-current opacity-40 hover:opacity-100 transition-opacity duration-500" xmlns="http://www.w3.org/2000/svg">
                {/* Icon — official Antigravity path scaled to 24×24 */}
                <g transform="translate(0, 0) scale(1)">
                    <path d="M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z" />
                </g>
                <text x="30" y="19" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="18" letterSpacing="-0.5">Antigravity</text>
            </svg>
        )
    },
    {
        name: 'Anthropic',
        logo: (
            <svg viewBox="0 0 120 24" className="h-6 fill-current opacity-40 hover:opacity-100 transition-opacity duration-500">
                <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
                <text x="30" y="19" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="18" letterSpacing="0">Anthropic</text>
            </svg>
        )
    },
    {
        name: 'BookMyChef',
        logo: (
            <img src="/bookmychef-logo.png" alt="BookMyChef" className="bookmychef-logo" style={{ height: '2.5rem' }} />
        )
    }
];

const ClientsSection: React.FC = () => {
    return (
        <section id="case-studies" className="results-section overflow-hidden">

            {/* Partners Marquee */}
            <div className="marquee-container">
                <div className="section-container">
                    <h3 className="marquee-title">
                        Powered By & Trusted By
                    </h3>
                </div>
                <div className="marquee-track-wrapper">
                    <div className="marquee-fade-left"></div>
                    <div className="marquee-fade-right"></div>
                    <div className="marquee-track animate-slide">
                        {[...partners, ...partners, ...partners].map((partner, index) => (
                            <div key={`${partner.name}-${index}`} className="marquee-logo">
                                {partner.logo}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="section-container">
                <div className="section-header">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="section-title"
                    >
                        Results From the Field
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="section-subtitle"
                    >
                        Live Systems. Real Numbers. Not prototypes. Production systems already generating revenue.
                    </motion.p>
                </div>

                <div className="results-grid">
                    {results.map((result, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 + 0.2 }}
                            className="result-card"
                        >
                            <h3 className="result-name">{result.name}{result.comingSoon && <span className="badge-coming-soon">Coming Soon</span>}</h3>
                            <div className="result-stat-container">
                                <span className="result-stat text-gradient">{result.stat}</span>
                                <span className="result-stat-desc">{result.statDesc}</span>
                            </div>
                            <p className="result-desc">{result.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ClientsSection;
