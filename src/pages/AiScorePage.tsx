import React, { useEffect, useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import ScoreReport from '../components/ai-score/ScoreReport';
import PokemonCard from '../components/ai-score/PokemonCard';
import ClaimPhysicalCard from '../components/ai-score/ClaimPhysicalCard';
import { trackEvent } from '../lib/analytics';
import { featureFlags } from '../lib/features';

const PDFJS_CDN_VERSION = '4.4.168';
const PDFJS_CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_CDN_VERSION}`;

let _pdfjsLib: any = null;
const loadPdfJs = async () => {
    if (_pdfjsLib) return _pdfjsLib;
    _pdfjsLib = await import(/* @vite-ignore */ `${PDFJS_CDN_BASE}/pdf.min.mjs`);
    _pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/pdf.worker.min.mjs`;
    return _pdfjsLib;
};

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
    const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
    const [isGeneratingBlob, setIsGeneratingBlob] = useState(false);
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

    // Pre-generate the download blob in the background when results are ready.
    // This allows handleDownload to be fully synchronous, which is strictly
    // required by iOS Safari to allow navigator.share() to work on click.
    useEffect(() => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS && step === 'results' && analysisData && cardRef.current) {
            const generateBlob = async () => {
                setIsGeneratingBlob(true);
                try {
                    // Give Framer Motion and fonts a tiny moment to settle before capturing
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const canvas = await captureBothSides(true); // Always offscreen for iOS
                    if (!canvas) return;

                    const blob = await new Promise<Blob | null>((resolve) =>
                        canvas.toBlob(resolve, 'image/jpeg', 0.9)
                    );
                    if (blob) setDownloadBlob(blob);
                } catch (err) {
                    console.error('Failed background card capture', err);
                } finally {
                    setIsGeneratingBlob(false);
                }
            };
            generateBlob();
        }
    }, [step, analysisData]);

    /**
     * html2canvas ignores CSS object-fit, so SVG data-URL images render
     * distorted/cropped. This helper pre-rasterises the SVG onto a canvas
     * at the exact container size (with contain-fit logic) and swaps the
     * img src to a properly-fitted PNG before capture.
     * Returns a restore function that puts the original src back.
     */
    const preRasterizeSvgImages = async (root: HTMLElement): Promise<() => void> => {
        const imgs = root.querySelectorAll<HTMLImageElement>('img.card-photo');
        const restorers: (() => void)[] = [];

        for (const img of imgs) {
            const src = img.src || img.getAttribute('src') || '';
            if (!src.startsWith('data:image/svg') && !src.startsWith('data:image/svg+xml')) continue;

            try {
                // Get the container's rendered dimensions
                const containerW = img.parentElement?.clientWidth || img.clientWidth || 400;
                const containerH = img.parentElement?.clientHeight || img.clientHeight || 300;

                // Load the SVG into a fresh Image to get its natural size
                const svgImg = new Image();
                svgImg.src = src;
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, 1500); // 1.5s max to prevent hangs
                    svgImg.onload = () => { clearTimeout(timer); resolve(); };
                    svgImg.onerror = () => { clearTimeout(timer); resolve(); };
                });

                // Compute cover-fit dimensions (fill container, crop excess — matches CSS object-fit: cover)
                const natW = svgImg.naturalWidth || 800;
                const natH = svgImg.naturalHeight || 600;
                const scale = Math.max(containerW / natW, containerH / natH);
                const drawW = natW * scale;
                const drawH = natH * scale;
                const offsetX = (containerW - drawW) / 2;
                const offsetY = (containerH - drawH) / 2;

                // Rasterise to a canvas at 2x for crisp output
                const cvs = document.createElement('canvas');
                cvs.width = containerW * 2;
                cvs.height = containerH * 2;
                const ctx = cvs.getContext('2d');
                if (!ctx) continue;
                ctx.scale(2, 2);
                ctx.drawImage(svgImg, offsetX, offsetY, drawW, drawH);

                const rasterUrl = cvs.toDataURL('image/png');
                const originalSrc = src;
                const originalObjFit = img.style.objectFit;
                const originalObjPos = img.style.objectPosition;

                img.src = rasterUrl;
                img.style.objectFit = 'fill';
                img.style.objectPosition = 'center';

                restorers.push(() => {
                    img.src = originalSrc;
                    img.style.objectFit = originalObjFit;
                    img.style.objectPosition = originalObjPos;
                });
            } catch {
                // If rasterisation fails, html2canvas will use the original SVG (acceptable fallback)
            }
        }

        return () => restorers.forEach(fn => fn());
    };

    const captureBothSides = async (useOffscreenClone = false) => {
        if (!cardRef.current) return null;

        const cardContainer = cardRef.current;
        let captureRoot = cardContainer;
        let offscreen: HTMLDivElement | null = null;

        if (useOffscreenClone) {
            // Create an off-screen container to capture the card without mutating the visible DOM
            offscreen = document.createElement('div');
            offscreen.style.position = 'fixed';
            offscreen.style.top = '-9999px';
            offscreen.style.left = '-9999px';
            offscreen.style.pointerEvents = 'none';
            document.body.appendChild(offscreen);

            captureRoot = cardContainer.cloneNode(true) as HTMLDivElement;
            offscreen.appendChild(captureRoot);
        }

        const frontEl = captureRoot.querySelector('.pokemon-card-front') as HTMLElement;
        const backEl = captureRoot.querySelector('.pokemon-card-back') as HTMLElement;
        if (!frontEl || !backEl) {
            if (offscreen) document.body.removeChild(offscreen);
            return null;
        }

        const opts = { backgroundColor: null, useCORS: true, scale: 2 };

        let oldPointerEvents = '';
        let oldFrontTransform = '';
        let oldBackTransform = '';
        let oldInnerTransform = '';
        let oldBackDisplay = backEl.style.display;
        let oldFrontDisplay = frontEl.style.display;
        const hadFrontFocus = captureRoot.classList.contains('front-focused');

        if (!useOffscreenClone) {
            oldPointerEvents = cardContainer.style.pointerEvents;
            cardContainer.style.pointerEvents = 'none';
            oldFrontTransform = frontEl.style.transform;
            oldBackTransform = backEl.style.transform;
        }

        const innerEl = captureRoot.querySelector('.pokemon-card-inner') as HTMLElement;
        if (!useOffscreenClone && innerEl) {
            oldInnerTransform = innerEl.style.transform;
        }

        // Flatten transforms for a clean 2D capture
        if (innerEl) innerEl.style.transform = 'none';
        frontEl.style.transform = 'none';
        backEl.style.transform = 'none';

        if (hadFrontFocus) {
            captureRoot.classList.remove('front-focused');
        }

        // Pre-rasterise SVGs so they render properly
        const restoreSvg = await preRasterizeSvgImages(captureRoot);

        try {
            // ONLY explicitly show FRONT, completely hide BACK to avoid iOS Safari bleed
            backEl.style.display = 'none';
            frontEl.style.display = 'block';

            await new Promise(resolve => setTimeout(resolve, 50));
            const frontCanvas = await html2canvas(frontEl, opts);

            // ONLY explicitly show BACK, completely hide FRONT
            frontEl.style.display = 'none';
            backEl.style.display = 'block';

            await new Promise(resolve => setTimeout(resolve, 50));
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
            if (useOffscreenClone) {
                if (offscreen) document.body.removeChild(offscreen);
            } else {
                restoreSvg();
                backEl.style.display = oldBackDisplay;
                frontEl.style.display = oldFrontDisplay;
                if (innerEl) innerEl.style.transform = oldInnerTransform;
                frontEl.style.transform = oldFrontTransform;
                backEl.style.transform = oldBackTransform;
                if (hadFrontFocus) {
                    captureRoot.classList.add('front-focused');
                }
                cardContainer.style.pointerEvents = oldPointerEvents;
            }
        }
    };

    const handleDownload = async () => {
        if (!analysisData) return;

        try {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

            // Use the pre-generated blob if ready (makes the click instant for iOS),
            // otherwise generate on the fly with the appropriate platform strategy
            let blob = downloadBlob;
            if (!blob) {
                const canvas = await captureBothSides(isIOS);
                if (!canvas) return;
                blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            }
            if (!blob) return;

            // iOS Primary: Web Share API (native "Save Image" option without blank window flash)
            if (isIOS && navigator.share) {
                const file = new File([blob], `AI-Resilience-Card-${analysisData?.pokemon?.name || 'Score'}.jpg`, { type: 'image/jpeg' });
                if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file] });
                    trackEvent('ai_card_downloaded', { aiRunId: aiRunId || null, method: 'web_share' });
                    return; // Done!
                }
            }

            // Standard fallback for Non-iOS (or iOS where Web Share is heavily restricted)
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `AI-Resilience-Card-${analysisData?.pokemon?.name || 'Score'}.jpg`;
            link.href = blobUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

            trackEvent('ai_card_downloaded', { aiRunId: aiRunId || null, method: 'link_download' });
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

        // --- DESKTOP / ANDROID FLOW BELOW ---
        // (This uses window.open and creates a persistent custom share URL image)

        // iOS Safari blocks window.open after async calls, so open the window FIRST
        const shareWindow = window.open('', '_blank');

        // Improve UX: show a loading state instead of a stark blank page
        if (shareWindow) {
            shareWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Preparing Share...</title>
                    <style>
                        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb; font-family: -apple-system, sans-serif; }
                        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        h2 { color: #1e293b; margin: 0 0 8px 0; }
                        p { color: #64748b; margin: 0; }
                    </style>
                </head>
                <body>
                    <div class="loader"></div>
                    <h2>Generating your card...</h2>
                    <p>Redirecting to LinkedIn in a moment</p>
                </body>
                </html>
            `);
        }

        // Let React render the loading UI
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const canvas = await captureBothSides();
            let cardDataUrl = '';
            let shareTarget = `${window.location.origin}/ai-score`;

            if (canvas) {
                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
                if (blob) {
                    cardDataUrl = canvas.toDataURL('image/jpeg', 0.8);
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

            // Navigate the pre-opened window to LinkedIn
            if (shareWindow && !shareWindow.closed) {
                shareWindow.location.href = linkedInShareUrl;
            } else {
                // Fallback: navigate current page if popup was blocked
                window.location.href = linkedInShareUrl;
            }
            trackEvent('ai_share_created', { aiRunId: aiRunId || null, shareUrl: shareTarget });
        } catch (error) {
            console.error('Share failed', error);
            // Close the blank window on error
            if (shareWindow && !shareWindow.closed) shareWindow.close();
            trackEvent('ai_share_failed', { aiRunId: aiRunId || null, error: (error as Error)?.message || 'unknown' });
            alert('Unable to open LinkedIn share. Please try again.');
        } finally {
            queueTransition(() => setIsSharing(false), 700);
        }
    };

    const smoothScrollTo = (targetY: number, duration: number = 800) => {
        const startY = window.scrollY;
        const difference = targetY - startY;
        const startTime = performance.now();

        const step = (currentTime: number) => {
            const progress = (currentTime - startTime) / duration;
            if (progress < 1) {
                // Ease out cubic
                const easeOut = 1 - Math.pow(1 - progress, 3);
                window.scrollTo(0, startY + difference * easeOut);
                requestAnimationFrame(step);
            } else {
                window.scrollTo(0, targetY);
            }
        };
        requestAnimationFrame(step);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 512;
                    const MAX_HEIGHT = 512;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG with 0.8 quality to prevent "Payload Too Large"
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    setImagePreview(dataUrl);

                    // Auto-scroll the submit button back into view for mobile users slowly
                    setTimeout(() => {
                        const scanBtn = document.querySelector('.scan-btn');
                        if (scanBtn) {
                            const rect = scanBtn.getBoundingClientRect();
                            const targetY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
                            smoothScrollTo(targetY, 1000); // 1-second gentle glide
                        }
                    }, 100);
                };
                if (event.target?.result) {
                    img.src = event.target.result as string;
                }
            };
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
        smoothScrollTo(0, 800);
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
                type = 'text';
                try {
                    console.log('Attempting client-side PDF parsing...');
                    const pdfjsLib = await loadPdfJs();
                    const arrayBuffer = await resumeFile.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
                    const pages: string[] = [];
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        pages.push(content.items.map((item: any) => ('str' in item ? item.str : '')).join(' '));
                    }
                    data = pages.join('\n').trim();
                    if (!data) throw new Error('empty');
                    console.log('PDF parsed successfully. Extracted text length:', data.length);
                    // Truncate to avoid oversized payloads / OpenAI timeouts
                    if (data.length > 10000) {
                        console.warn('Truncating PDF text to 10000 characters to avoid oversized payload.');
                        data = data.substring(0, 10000);
                    }
                } catch (pdfErr) {
                    console.error('Client-side PDF parsing failed:', pdfErr);
                    alert('Could not read this PDF. Please paste your resume text in the Bio field instead.');
                    setStep('input');
                    return;
                }
            } else if (inputUrl) {
                type = 'url';
                data = inputUrl;
            }

            const payload = { type, data };
            console.log('Sending analysis request with payload:', payload);

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
                                        <button onClick={handleDownload} disabled={!analysisData || isGeneratingBlob} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', height: 'fit-content', opacity: analysisData && !isGeneratingBlob ? 1 : 0.65, cursor: analysisData && !isGeneratingBlob ? 'pointer' : 'not-allowed' }}>
                                            <span>{isGeneratingBlob ? '⏳' : '📥'}</span> {isGeneratingBlob ? 'Preparing...' : 'Download'}
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', marginTop: '1.5rem', gap: '1rem', alignItems: 'start' }}>
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
