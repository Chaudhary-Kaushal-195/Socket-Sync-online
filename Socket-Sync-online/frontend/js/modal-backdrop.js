// Add backdrop overlay for media modals
function addModalBackdrop() {
    let backdrop = document.getElementById('mediaBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mediaBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 2999;
            display: none;
        `;
        document.body.appendChild(backdrop);

        // Close on backdrop click
        backdrop.onclick = () => {
            if (!document.getElementById('mediaModal').classList.contains('hidden')) {
                closeMediaModal();
            }
            if (!document.getElementById('carouselModal').classList.contains('hidden')) {
                closeCarouselModal();
            }
        };
    }
    return backdrop;
}

// Update existing close/open functions to manage backdrop
const originalOpenImageModal = window.openImageModal;
if (originalOpenImageModal) {
    window.openImageModal = function (url) {
        addModalBackdrop().style.display = 'block';
        originalOpenImageModal.call(this, url);
    };
}

const originalOpenVideoModal = window.openVideoModal;
if (originalOpenVideoModal) {
    window.openVideoModal = function (url) {
        addModalBackdrop().style.display = 'block';
        originalOpenVideoModal.call(this, url);
    };
}

const originalOpenCarousel = window.openCarousel;
if (originalOpenCarousel) {
    window.openCarousel = function (...args) {
        addModalBackdrop().style.display = 'block';
        originalOpenCarousel.apply(this, args);
    };
}

const originalCloseMediaModal = window.closeMediaModal;
if (originalCloseMediaModal) {
    window.closeMediaModal = function () {
        const backdrop = document.getElementById('mediaBackdrop');
        if (backdrop) backdrop.style.display = 'none';
        originalCloseMediaModal.call(this);
    };
}

const originalCloseCarouselModal = window.closeCarouselModal;
if (originalCloseCarouselModal) {
    window.closeCarouselModal = function () {
        const backdrop = document.getElementById('mediaBackdrop');
        if (backdrop) backdrop.style.display = 'none';
        originalCloseCarouselModal.call(this);
    };
}
