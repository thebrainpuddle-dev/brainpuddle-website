import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import ScoreReport from '../components/ai-score/ScoreReport';
import PokemonCard from '../components/ai-score/PokemonCard';

// Set the worker source for PDF.js to load robustly via CDN to prevent Vite bundling errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const AiScorePage: React.FC<{ onContactOpen?: () => void }> = ({ onContactOpen }) => {
    const [step, setStep] = useState<'input' | 'analyzing' | 'results'>('input');
    const [inputUrl, setInputUrl] = useState('');
    const [rawText, setRawText] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [analysisText, setAnalysisText] = useState('Booting up quantum analysis core...');
    const [analysisData, setAnalysisData] = useState<any>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [claimStatus, setClaimStatus] = useState<'idle' | 'loading' | 'success' | 'full' | 'error'>('idle');
    const [claimError, setClaimError] = useState('');
    const [claimForm, setClaimForm] = useState({ name: '', linkedin: '', address: '' });

    const handleClaim = async (e: React.FormEvent) => {
        e.preventDefault();
        setClaimStatus('loading');
        try {
            // First, try to capture and upload the visual card
            let cardImageUrl = '';
            try {
                const canvas = await captureBothSides();
                if (canvas) {
                    const dataUrl = canvas.toDataURL('image/png');
                    const uploadRes = await fetch('/api/upload-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: dataUrl })
                    });
                    if (uploadRes.ok) {
                        const uploadData = await uploadRes.json();
                        cardImageUrl = uploadData.imageUrl || '';
                    }
                }
            } catch (err) {
                console.error("Failed to generate and upload physical card image preview:", err);
                // We don't fail the whole claim process just because the screenshot failed
            }

            const res = await fetch('/api/claim-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: claimForm.name,
                    linkedinUrl: claimForm.linkedin,
                    address: claimForm.address,
                    score: analysisData?.score,
                    tier: analysisData?.tier,
                    pokemonName: analysisData?.pokemon?.name || 'Unknown',
                    imageUrl: cardImageUrl
                })
            });
            const data = await res.json();
            if (res.ok) {
                setClaimStatus('success');
            } else {
                setClaimStatus('error');
                setClaimError(data.error || 'Failed to claim card');
            }
        } catch (error) {
            setClaimStatus('error');
            setClaimError('Network error');
        }
    };

    const captureBothSides = async () => {
        if (!cardRef.current) return null;
        const frontEl = cardRef.current.querySelector('.pokemon-card-front') as HTMLElement;
        const backEl = cardRef.current.querySelector('.pokemon-card-back') as HTMLElement;
        if (!frontEl || !backEl) return null;

        const opts = { backgroundColor: null, useCORS: true, scale: 2 };

        // Temporarily remove transform/backface visibility for clean flat 2D capture
        const oldFrontTransform = frontEl.style.transform;
        const oldBackTransform = backEl.style.transform;
        frontEl.style.transform = 'none';
        backEl.style.transform = 'none';

        const frontCanvas = await html2canvas(frontEl, opts);
        const backCanvas = await html2canvas(backEl, opts);

        // Restore styles
        frontEl.style.transform = oldFrontTransform;
        backEl.style.transform = oldBackTransform;

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
    };

    const handleDownload = async () => {
        try {
            const canvas = await captureBothSides();
            if (!canvas) return;
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `AI-Resilience-Card-${analysisData?.pokemon?.name || 'Score'}.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            console.error('Failed to download image', error);
        }
    };

    const handleLinkedInShare = async () => {
        try {
            setIsSharing(true);

            // 1. Capture both sides of the card
            const canvas = await captureBothSides();
            if (!canvas) throw new Error("Could not capture card");
            const dataUrl = canvas.toDataURL('image/png');

            // 2. Upload to Imgur via our backend
            const uploadRes = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: dataUrl })
            });

            if (!uploadRes.ok) throw new Error('Failed to upload image for sharing');
            const { url: imageUrl } = await uploadRes.json();

            // 3. Share text + imageUrl (Raw Link per user request)
            const text = `I just checked my AI Resilience Score on BrainPuddle! My replaceability index is ${analysisData?.score}/100 and I am ranked as ${analysisData?.tier}. \n\nCheck yours here: https://brainpuddle.com/ai-score\n\n${imageUrl}`;
            const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        } catch (error) {
            console.error('Share failed', error);
            alert('Failed to generate shareable image. You can still download it normally.');
        } finally {
            setIsSharing(false);
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

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!inputUrl && !resumeFile && !rawText.trim()) {
            alert('Please provide a LinkedIn URL, upload a Resume, or paste your Bio.');
            return;
        }

        setStep('analyzing');
        setAnalysisText('Booting up quantum analysis core...');

        try {
            // 1. Fetch analysis
            setTimeout(() => setAnalysisText('Cross-referencing AI capabilities...'), 1000);

            // Determine input type and payload
            let type = 'text';
            let data = rawText.trim();

            if (resumeFile) {
                type = 'text'; // Send extracted text, bypassing the Lambda timeout
                setAnalysisText('Extracting text locally from PDF...');

                try {
                    const arrayBuffer = await resumeFile.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let fullText = "";

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map((item: any) => item.str).join(' ');
                        fullText += pageText + "\n";
                    }

                    data = fullText.trim();
                    if (!data) throw new Error("Could not extract any text from the PDF. It might be an image-only scan.");

                    setTimeout(() => setAnalysisText('Cross-referencing AI capabilities...'), 500);
                } catch (e: any) {
                    console.error("Local PDF Extraction error", e);
                    alert("Failed to read the PDF. Ensure it's not password-protected and contains detectable text.");
                    setStep('input');
                    return;
                }
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
            const apiData = await response.json();

            setAnalysisText('Calculating replaceability index...');
            setAnalysisData(apiData);

            // Generate the image in the background, we will update it later
            generateCardImage(apiData, imagePreview);

            setTimeout(() => {
                setStep('results');
            }, 1500);

        } catch (error) {
            console.error(error);
            setAnalysisText('Error analyzing profile. Please try again.');
            setTimeout(() => setStep('input'), 3000);
        }
    };

    const generateCardImage = async (data: any, imageBase64: string | null) => {
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
                const imgData = await response.json();
                setAnalysisData((prev: any) => ({
                    ...prev,
                    pokemon: {
                        ...prev.pokemon,
                        photoUrl: imgData.imageUrl
                    }
                }));
            }
        } catch (error) {
            console.error("Failed to generate image", error);
        }
    };

    return (
        <main className="main-content ai-score-page" style={{ paddingTop: '6rem', minHeight: '100vh' }}>
            <div className="ai-score-container">
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
                                            style={{ width: '100%', padding: '1rem', background: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', color: 'var(--text-primary)', opacity: resumeFile || inputUrl ? 0.5 : 1, pointerEvents: resumeFile || inputUrl ? 'none' : 'auto', resize: 'vertical' }}
                                        />
                                    </div>
                                    <div className="input-group" style={{ marginTop: '1rem' }}>
                                        <label htmlFor="user-photo">Optional: Profile Photo (for Gamified Card)</label>
                                        <input
                                            type="file"
                                            id="user-photo"
                                            accept="image/png, image/jpeg, image/jpg"
                                            onChange={handleImageUpload}
                                            style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '100%' }}
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
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 6, ease: "linear" }}
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
                                            score={analysisData.score}
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
                                            {analysisData.levelUpSuggestions?.map((sugg: string, i: number) => (
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

                                    <p style={{
                                        fontSize: '0.9rem',
                                        color: '#666',
                                        fontStyle: 'italic',
                                        margin: '-0.5rem 0 0.5rem 0',
                                        textAlign: 'center'
                                    }}>
                                        👆 Click on the card above to flip!
                                    </p>

                                    <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button onClick={handleDownload} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', height: 'fit-content' }}>
                                            <span>📥</span> Download
                                        </button>
                                        <button onClick={handleLinkedInShare} disabled={isSharing} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0a66c2', color: 'white', borderColor: '#0a66c2', height: 'fit-content', opacity: isSharing ? 0.7 : 1, cursor: isSharing ? 'not-allowed' : 'pointer' }}>
                                            <span>🔗</span> {isSharing ? 'Generating Image...' : 'Share on LinkedIn'}
                                        </button>
                                    </div>

                                    <div className="claim-card-section glass" style={{ width: '100%', padding: '1.5rem', marginTop: '1rem', borderRadius: '1rem' }}>
                                        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Claim Physical Card</span>
                                            <span style={{ fontSize: '0.85rem', background: 'var(--accent-color)', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>
                                                Limited Edition: 100 Available
                                            </span>
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                            First 100 users get a premium holographic physical print of their card delivered for free!
                                        </p>

                                        {claimStatus === 'success' ? (
                                            <div style={{ padding: '1rem', background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                                                🎉 Claim successful! Your card is in the queue.
                                            </div>
                                        ) : claimStatus === 'full' ? (
                                            <div style={{ padding: '1rem', background: 'rgba(244, 67, 54, 0.1)', color: '#f44336', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                                                Sorry, all 100 cards have been claimed!
                                            </div>
                                        ) : (
                                            <form onSubmit={handleClaim} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                <input required type="text" placeholder="Full Name" value={claimForm.name} onChange={e => setClaimForm({ ...claimForm, name: e.target.value })} style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', background: 'var(--bg-dark)' }} />
                                                <input required type="url" placeholder="LinkedIn Profile URL" value={claimForm.linkedin} onChange={e => setClaimForm({ ...claimForm, linkedin: e.target.value })} style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', background: 'var(--bg-dark)' }} />
                                                <textarea required placeholder="Delivery Address" value={claimForm.address} onChange={e => setClaimForm({ ...claimForm, address: e.target.value })} rows={2} style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', background: 'var(--bg-dark)', resize: 'vertical' }} />
                                                <button type="submit" disabled={claimStatus === 'loading'} className="btn-primary" style={{ marginTop: '0.5rem', opacity: claimStatus === 'loading' ? 0.7 : 1 }}>
                                                    {claimStatus === 'loading' ? 'Claiming...' : 'Claim My Free Card'}
                                                </button>
                                                {claimStatus === 'error' && <div style={{ color: '#f44336', fontSize: '0.8rem', textAlign: 'center' }}>{claimError}</div>}
                                            </form>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
};

export default AiScorePage;
