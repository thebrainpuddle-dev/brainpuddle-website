import React, { useEffect, useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import ScoreReport from '../components/ai-score/ScoreReport';
import PokemonCard from '../components/ai-score/PokemonCard';
import ClaimPhysicalCard from '../components/ai-score/ClaimPhysicalCard';
import { trackEvent } from '../lib/analytics';
import { featureFlags } from '../lib/features';

interface AnalysisResult {
    score: number;
    tier: string;
    tierColor: string;
    categories: { name: string; score: number; max: number }[];
    xp: number;
    levelUpSuggestions?: string[];
    pokemon: {
        name: string;
        title: string;
        photoUrl: string;
        type: string;
        stage: string;
        hp: number;
        skills: string[];
        stats: {
            cognitiveDepth: number;
            decisionAutonomy: number;
            adaptability: number;
            systemLeverage: number;
        };
        primaryDomain: string;
        operatingMode: string;
        humanLeverage: string;
        powerUps: { name: string; desc: string }[];
        pokedexEntry: string;
    };
}

const AiScorePage: React.FC<{ onContactOpen?: () => void }> = ({ onContactOpen }) => {
    const [step, setStep] = useState<'input' | 'analyzing' | 'results'>('input');
    const [inputUrl, setInputUrl] = useState('');
    const [rawText, setRawText] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [analysisText, setAnalysisText] = useState('Booting up quantum analysis core...');
    const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
    const [aiRunId, setAiRunId] = useState<string | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);
    const transitionTimeoutsRef = useRef<number[]>([]);
    const scanRequestIdRef = useRef(0);

    const clearTransitionTimers = () => {
        transitionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        transitionTimeoutsRef.current = [];
    };

    const queueTransition = (callback: () => void, delayMs: number) => {
        const timeoutId = window.setTimeout(callback, delayMs);
        transitionTimeoutsRef.current.push(timeoutId);
        return timeoutId;
    };

    useEffect(() => {
        return () => {
            clearTransitionTimers();
        };
    }, []);

    const captureBothSides = async () => {
        if (!cardRef.current) return null;
        const cardContainer = cardRef.current;
        const frontEl = cardContainer.querySelector('.pokemon-card-front') as HTMLElement;
        const backEl = cardContainer.querySelector('.pokemon-card-back') as HTMLElement;
        if (!frontEl || !backEl) return null;

        const opts = { backgroundColor: null, useCORS: true, scale: 2 };
        const hadFrontFocus = cardContainer.classList.contains('front-focused');

        // Temporarily remove transform/backface visibility for clean flat 2D capture
        const oldFrontTransform = frontEl.style.transform;
        const oldBackTransform = backEl.style.transform;
        if (hadFrontFocus) {
            cardContainer.classList.remove('front-focused');
        }

        frontEl.style.transform = 'none';
        backEl.style.transform = 'none';

        try {
            const frontCanvas = await html2canvas(frontEl, opts);
            const backCanvas = await html2canvas(backEl, opts);

            const gap = 40;
            const padding = 40;
            const width = frontCanvas.width + backCanvas.width + gap + (padding * 2);
            const height = Math.max(frontCanvas.height, backCanvas.height) + (padding * 2);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // Draw transparent/white gradient background
            ctx.fillStyle = '#F9F9F9';
            ctx.fillRect(0, 0, width, height);

            ctx.drawImage(frontCanvas, padding, padding);
            ctx.drawImage(backCanvas, padding + frontCanvas.width + gap, padding);

            return canvas;
        } finally {
            frontEl.style.transform = oldFrontTransform;
            backEl.style.transform = oldBackTransform;
            if (hadFrontFocus) {
                cardContainer.classList.add('front-focused');
            }
        }
    };

    const handleDownload = async () => {
        if (!analysisData) return;
        try {
            const canvas = await captureBothSides();
            if (!canvas) return;
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `AI-Resilience-Card-${analysisData?.pokemon?.name || 'Score'}.png`;
            link.href = dataUrl;
            link.click();
            trackEvent('ai_card_downloaded', { aiRunId: aiRunId || null });
        } catch (error) {
            console.error('Failed to download image', error);
            trackEvent('ai_card_download_failed', {
                aiRunId: aiRunId || null,
                reason: (error as Error)?.message || 'unknown'
            });
        }
    };

    const handleLinkedInShare = async () => {
        if (!analysisData || isSharing) return;

        setIsSharing(true);
        trackEvent('ai_share_clicked', { aiRunId: aiRunId || null });

        try {
            const canvas = await captureBothSides();
            let sharedViaNativeSheet = false;
            let shareFile: File | null = null;
            const fileName = `AI-Resilience-Card-${analysisData.pokemon.name || 'Score'}.png`;
            let cardDataUrl = '';
            let shareTarget = `${window.location.origin}/ai-score`;

            if (canvas) {
                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    shareFile = new File([blob], fileName, { type: 'image/png' });
                    cardDataUrl = canvas.toDataURL('image/png');
                }
            }

            if (featureFlags.persistentShare && cardDataUrl) {
                const shareCreateResponse = await fetch('/api/share-card/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        aiRunId,
                        name: analysisData.pokemon.name || 'Professional User',
                        title: analysisData.pokemon.title || 'Digital Professional',
                        score: Number(analysisData.score ?? 50),
                        tier: analysisData.tier || '⚔️ AI-Resistant',
                        cardImageBase64: cardDataUrl
                    })
                });
                if (!shareCreateResponse.ok) {
                    throw new Error('Failed to persist share card');
                }
                const payload = await shareCreateResponse.json() as { shareUrl?: string };
                if (payload.shareUrl) {
                    shareTarget = payload.shareUrl;
                }
            }

            const shareLines = [
                `I just checked my AI Resilience Score on BrainPuddle.`,
                `AI Resilience Score: ${100 - Number(analysisData.score)}/100`,
                `Tier: ${analysisData.tier}`,
                `Check yours: ${shareTarget}`
            ];
            const shareText = shareLines.join('\n');
            const linkedInShareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;

            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(shareText).catch(() => {
                    // Clipboard is optional; sharing should continue even if it fails.
                });
            }

            if (
                shareFile &&
                navigator.share &&
                (!navigator.canShare || navigator.canShare({ files: [shareFile] }))
            ) {
                try {
                    await navigator.share({
                        title: 'BrainPuddle AI Resilience Score',
                        text: shareText,
                        url: shareTarget,
                        files: [shareFile]
                    });
                    sharedViaNativeSheet = true;
                } catch (shareError) {
                    // If native share fails/cancels, continue with LinkedIn web fallback.
                    console.warn('Native share unavailable, falling back to LinkedIn composer.', shareError);
                }
            }

            if (!sharedViaNativeSheet) {
                const openedWindow = window.open(linkedInShareUrl, '_blank', 'noopener,noreferrer');
                if (!openedWindow) {
                    window.location.href = linkedInShareUrl;
                }
            }
            trackEvent('ai_share_created', { aiRunId: aiRunId || null, shareUrl: shareTarget });
        } catch (error) {
            console.error('Share failed', error);
            trackEvent('ai_share_failed', { aiRunId: aiRunId || null, error: (error as Error)?.message || 'unknown' });
            alert('Unable to open LinkedIn share. Please try again.');
        } finally {
            queueTransition(() => setIsSharing(false), 700);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const persistAiRun = async (params: {
        inputType: string;
        linkedinUrl: string;
        inputCharCount: number;
        score: number;
        tier: string;
        analysisLatencyMs: number;
        imageSource: string;
    }) => {
        try {
            const response = await fetch('/api/ai-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            if (!response.ok) return null;
            const payload = await response.json() as { aiRunId?: string };
            return payload.aiRunId || null;
        } catch {
            return null;
        }
    };

    // Dynamic Rotating Loading Text
    useEffect(() => {
        let textInterval: number;
        if (step === 'analyzing') {
            const loadingPhrases = [
                "Cross-referencing AI capabilities...",
                "Quantifying workflow replaceability...",
                "Extracting domain-specific context...",
                "Simulating automation scenarios...",
                "Deriving final AI Resilience metrics..."
            ];
            let phraseIndex = 0;
            setAnalysisText(loadingPhrases[0]);

            textInterval = setInterval(() => {
                phraseIndex = (phraseIndex + 1) % loadingPhrases.length;
                setAnalysisText(loadingPhrases[phraseIndex]);
            }, 2500); // Change text every 2.5 seconds
        }
        return () => {
            if (textInterval) clearInterval(textInterval);
        };
    }, [step]);

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!inputUrl && !resumeFile && !rawText.trim()) {
            alert('Please provide a LinkedIn URL, upload a Resume, or paste your Bio.');
            return;
        }

        clearTransitionTimers();
        const requestId = ++scanRequestIdRef.current;
        const scanStartedAt = performance.now();

        setAnalysisData(null);
        setAiRunId(null);
        setStep('analyzing');
        // Let the useEffect handle the rotating text

        trackEvent('ai_scan_submitted', {
            inputType: resumeFile ? 'pdf' : inputUrl ? 'url' : 'text',
            hasImage: Boolean(imagePreview)
        });

        try {
            // 1. Fetch analysis
            // The rotating text is now handled by the useEffect, no need for this queueTransition
            // queueTransition(() => {
            //     if (scanRequestIdRef.current === requestId) {
            //         setAnalysisText('Cross-referencing AI capabilities...');
            //     }
            // }, 1000);

            // Determine input type and payload
            let type = 'text';
            let data = rawText.trim();

            if (resumeFile) {
                type = 'pdf';
                data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64 = (reader.result as string).split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(resumeFile);
                });
            } else if (inputUrl) {
                type = 'url';
                data = inputUrl;
            }

            const payload = { type, data };

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Analysis failed');
            const apiData = await response.json() as AnalysisResult;
            if (scanRequestIdRef.current !== requestId) return;

            setAnalysisText('Calculating replaceability index...');
            setAnalysisData(apiData);

            const trackedRunId = await persistAiRun({
                inputType: type,
                linkedinUrl: type === 'url' ? data : '',
                inputCharCount: type === 'text' ? rawText.trim().length : data.length,
                score: apiData.score,
                tier: apiData.tier,
                analysisLatencyMs: Math.round(performance.now() - scanStartedAt),
                imageSource: imagePreview ? 'user_upload' : 'generated'
            });
            setAiRunId(trackedRunId);
            trackEvent('ai_scan_succeeded', {
                inputType: type,
                score: apiData.score,
                tier: apiData.tier,
                aiRunId: trackedRunId || null
            });

            // Generate the image in the background, we will update it later
            generateCardImage(apiData, imagePreview, requestId, trackedRunId);

            queueTransition(() => {
                if (scanRequestIdRef.current === requestId) {
                    setStep('results');
                }
            }, 1500);

        } catch (error) {
            console.error(error);
            trackEvent('ai_scan_failed', {
                reason: (error as Error)?.message || 'unknown'
            });
            if (scanRequestIdRef.current !== requestId) return;
            setAnalysisText('Error analyzing profile. Please try again.');
            queueTransition(() => {
                if (scanRequestIdRef.current === requestId) {
                    setStep('input');
                }
            }, 3000);
        }
    };

    const generateCardImage = async (data: AnalysisResult, imageBase64: string | null, requestId: number, trackedRunId: string | null) => {
        try {
            const response = await fetch('/api/generate-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.pokemon.name,
                    title: data.pokemon.title,
                    type: data.pokemon.type,
                    analysis: data,
                    imagePromptBase64: imageBase64
                })
            });
            if (response.ok) {
                const imgData = await response.json() as { imageUrl?: string };
                if (scanRequestIdRef.current !== requestId) return;
                const imageUrl = imgData.imageUrl;
                if (!imageUrl) return;

                setAnalysisData((prev) => ({
                    ...(prev ?? data),
                    pokemon: {
                        ...(prev?.pokemon ?? data.pokemon),
                        photoUrl: imageUrl
                    }
                }));
                trackEvent('ai_card_generated', {
                    aiRunId: trackedRunId || aiRunId || null,
                    source: imageBase64 ? 'upload' : 'generated'
                });
            }
        } catch (error) {
            console.error("Failed to generate image", error);
            trackEvent('ai_card_generation_failed', {
                aiRunId: trackedRunId || aiRunId || null,
                reason: (error as Error)?.message || 'unknown'
            });
        }
    };

    return (
        <main className="main-content ai-score-page" style={{ paddingTop: '6rem', minHeight: '100vh' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
                <Link to="/" style={{ display: 'inline-block', marginBottom: '2rem', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-color)' }}>
                    ← Back to Studio
                </Link>

                <AnimatePresence mode="wait">
                    {step === 'input' && (
                        <motion.div
                            key="input"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.5 }}
                            className="input-section"
                        >
                            <div className="hero-text-center">
                                <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', marginBottom: '1rem' }}>
                                    Are you <span style={{ color: 'var(--accent-color)' }}>Replaceable?</span>
                                </h1>
                                <p className="hero-subtitle" style={{ marginBottom: '3rem' }}>
                                    Upload your resume or paste your LinkedIn to get a gamified breakdown of your AI survival odds.
                                </p>
                            </div>

                            <div className="form-container glass">
                                <form onSubmit={handleScan}>
                                    <div className="input-group">
                                        <label htmlFor="linkedin">LinkedIn URL</label>
                                        <input
                                            type="url"
                                            id="linkedin"
                                            placeholder="https://linkedin.com/in/yourprofile"
                                            value={inputUrl}
                                            onChange={(e) => { setInputUrl(e.target.value); setRawText(''); setResumeFile(null); }}
                                            style={{ opacity: resumeFile || rawText ? 0.5 : 1, pointerEvents: resumeFile || rawText ? 'none' : 'auto' }}
                                        />
                                    </div>
                                    <div className="divider" style={{ margin: '1rem 0', fontSize: '0.8rem' }}><span>OR PASTE TEXT</span></div>
                                    <div className="input-group">
                                        <label htmlFor="rawText">Bio / Experience</label>
                                        <textarea
                                            id="rawText"
                                            placeholder="Paste your resume text or bio here..."
                                            value={rawText}
                                            onChange={(e) => { setRawText(e.target.value); setInputUrl(''); setResumeFile(null); }}
                                            rows={4}
                                            style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', opacity: resumeFile || inputUrl ? 0.5 : 1, pointerEvents: resumeFile || inputUrl ? 'none' : 'auto', resize: 'vertical' }}
                                        />
                                    </div>
                                    <div className="input-group" style={{ marginTop: '1rem' }}>
                                        <label htmlFor="user-photo">Optional: Profile Photo (for Gamified Card)</label>
                                        <input
                                            type="file"
                                            id="user-photo"
                                            accept="image/png, image/jpeg, image/jpg"
                                            onChange={handleImageUpload}
                                            style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', width: '100%' }}
                                        />
                                        {imagePreview && (
                                            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <img src={imagePreview} alt="Preview" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ready for gamified transformation</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="divider" style={{ margin: '1.5rem 0' }}><span>OR</span></div>

                                    <div
                                        className={`upload-zone ${isDragging ? 'dragging' : ''} ${resumeFile ? 'has-file' : ''}`}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            const file = e.dataTransfer.files?.[0];
                                            if (file && file.type === 'application/pdf') {
                                                setResumeFile(file);
                                                setInputUrl('');
                                                setRawText('');
                                            }
                                        }}
                                        style={{
                                            border: isDragging ? '2px dashed var(--accent-color)' : '1px dashed rgba(255,255,255,0.2)',
                                            background: isDragging ? 'rgba(255,255,255,0.05)' : 'transparent',
                                            transition: 'all 0.3s ease'
                                        }}
                                    >
                                        <div className="upload-icon">{resumeFile ? '✅' : '📄'}</div>
                                        <p>{resumeFile ? resumeFile.name : 'Drag & Drop Resume (PDF)'}</p>
                                        {!resumeFile && (
                                            <>
                                                <button type="button" className="mock-upload-btn" onClick={() => document.getElementById('resume-upload')?.click()}>
                                                    Browse Files
                                                </button>
                                                <input
                                                    type="file"
                                                    id="resume-upload"
                                                    accept=".pdf,application/pdf"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            setResumeFile(file);
                                                            setInputUrl('');
                                                            setRawText('');
                                                        }
                                                    }}
                                                />
                                            </>
                                        )}
                                        {resumeFile && (
                                            <button type="button" onClick={() => setResumeFile(null)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '0.85rem', marginTop: '10px' }}>
                                                Remove File
                                            </button>
                                        )}
                                    </div>

                                    <button type="submit" className="btn-primary scan-btn">
                                        Scan My Profile
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    )}

                    {step === 'analyzing' && (
                        <motion.div
                            key="analyzing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="analyzing-section"
                        >
                            <div className="spinner-container">
                                <div className="radar-spinner"></div>
                            </div>
                            <h2 className="analysis-text">{analysisText}</h2>
                            <div className="progress-bar-container">
                                <motion.div
                                    className="progress-bar-fill"
                                    initial={{ width: "5%" }}
                                    animate={{ width: "95%" }}
                                    transition={{ duration: 10, ease: "easeOut" }}
                                />
                            </div>
                        </motion.div>
                    )}

                    {step === 'results' && (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, staggerChildren: 0.2 }}
                            className="results-section-wrapper"
                        >
                            <div className="results-header">
                                <h2>Analysis Complete</h2>
                                <p>Flip your card to see your underlying stats.</p>
                            </div>

                            <div className="results-grid-layout">
                                <div className="report-col">
                                    {analysisData && (
                                        <ScoreReport
                                            score={100 - analysisData.score}
                                            tier={analysisData.tier}
                                            tierColor={analysisData.tierColor}
                                            categories={analysisData.categories}
                                            xp={analysisData.xp}
                                        />
                                    )}

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 1.5 }}
                                        className="action-card glass"
                                    >
                                        <h3>How to level up</h3>
                                        <ul className="powerup-list">
                                            {analysisData?.levelUpSuggestions?.map((sugg: string, i: number) => (
                                                <li key={i}>{sugg}</li>
                                            )) || (
                                                    <>
                                                        <li>Focus on highly empathetic client interactions (AI struggles here).</li>
                                                        <li>Automate your own repetitive reporting tasks before your boss does.</li>
                                                        <li>Lean into cross-disciplinary strategy rather than deep-but-narrow execution.</li>
                                                    </>
                                                )}
                                        </ul>
                                        <button onClick={onContactOpen} className="btn-secondary">Consult an Expert</button>
                                    </motion.div>
                                </div>

                                <div className="card-col" style={{ flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                                    {analysisData && <PokemonCard ref={cardRef} {...analysisData.pokemon} replaceabilityScore={analysisData.score} replaceabilityTier={analysisData.tier} />}

                                    <p className="card-hint-text" style={{
                                        fontSize: '0.9rem',
                                        color: '#666',
                                        fontStyle: 'italic',
                                        margin: '-0.5rem 0 0.5rem 0',
                                        textAlign: 'center'
                                    }}>
                                        👆 Click on the card above to flip!
                                    </p>

                                    <div className="card-actions" style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button onClick={handleDownload} disabled={!analysisData} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', height: 'fit-content', opacity: analysisData ? 1 : 0.65, cursor: analysisData ? 'pointer' : 'not-allowed' }}>
                                            <span>📥</span> Download
                                        </button>
                                        <button onClick={handleLinkedInShare} disabled={isSharing || !analysisData} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0a66c2', color: 'white', borderColor: '#0a66c2', height: 'fit-content', opacity: isSharing || !analysisData ? 0.7 : 1, cursor: isSharing || !analysisData ? 'not-allowed' : 'pointer' }}>
                                            <span>🔗</span> {isSharing ? 'Opening LinkedIn...' : 'Share on LinkedIn'}
                                        </button>
                                    </div>

                                    {featureFlags.claimForm && analysisData && (
                                        <ClaimPhysicalCard
                                            aiRunId={aiRunId}
                                            defaultLinkedinUrl={inputUrl}
                                        />
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {step !== 'analyzing' && (
                    <section className="glass" style={{ marginTop: '3rem', borderRadius: '1.4rem', border: 'var(--glass-border)', padding: '1.5rem' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                            AI Score Guide
                        </p>
                        <h2 style={{ margin: '0.55rem 0 1rem 0', fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)' }}>
                            AI Resilience Score: What, How, and Who
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                            <div style={{ border: 'var(--glass-border)', borderRadius: '0.9rem', background: 'var(--bg-dark)', padding: '0.95rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>What</h3>
                                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    The AI Resilience Score shows how strongly your current profile can withstand automation pressure.
                                </p>
                            </div>
                            <div style={{ border: 'var(--glass-border)', borderRadius: '0.9rem', background: 'var(--bg-dark)', padding: '0.95rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>How</h3>
                                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    We analyze your profile's unique human leverage, derive your AI-Resistant Tier, and summarize next actions to strengthen your position.
                                </p>
                            </div>
                            <div style={{ border: 'var(--glass-border)', borderRadius: '0.9rem', background: 'var(--bg-dark)', padding: '0.95rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>Who Should Use This</h3>
                                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    Professionals, students, and teams evaluating role durability, upskilling priorities, and AI adoption readiness.
                                </p>
                            </div>
                        </div>

                        {/* Evolution Graphic Section */}
                        <div style={{ marginTop: '2rem', marginBottom: '2rem', textAlign: 'center', background: 'var(--bg-dark)', border: 'var(--glass-border)', borderRadius: '1.2rem', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem' }}>The Evolution of AI Resilience</h3>
                            <p style={{ margin: '0 0 2rem 0', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: 1.6 }}>
                                Level up your career by evolving from an Execution Specialist into a Visionary AI Orchestrator guiding complex human-in-the-loop systems.
                            </p>

                            <img
                                src="/ai-resilience-evolution.png"
                                alt="Evolution from Execution Specialist to high resilience AI orchestrator"
                                style={{ maxWidth: '100%', height: 'auto', borderRadius: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)' }}
                                loading="lazy"
                            />

                            {/* Grading Labels */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', marginTop: '1.5rem', gap: '1rem' }}>
                                <div>
                                    <span style={{ color: '#F25F22', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>&lt; 30 Score</span>
                                    <h4 style={{ margin: '0.4rem 0 0 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Highly Replaceable</h4>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Execution Focus</p>
                                </div>
                                <div>
                                    <span style={{ color: '#F25F22', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>30 - 59 Score</span>
                                    <h4 style={{ margin: '0.4rem 0 0 0', fontSize: '1rem', color: 'var(--text-primary)' }}>At Risk</h4>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mixed Workflows</p>
                                </div>
                                <div>
                                    <span style={{ color: '#F25F22', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>60+ Score</span>
                                    <h4 style={{ margin: '0.4rem 0 0 0', fontSize: '1rem', color: 'var(--text-primary)' }}>AI-Resistant</h4>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Orchestration Focus</p>
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
};

export default AiScorePage;
