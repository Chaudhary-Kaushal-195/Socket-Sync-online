// ================= WEBRTC CALL LOGIC =================

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize Signaling Channel
let iceCandidateQueue = [];

function initCallChannel() {
    if (!window.supabase) return;
    
    callChannel = window.supabase.channel('room:calls');
    callChannel
        .on('broadcast', { event: 'call-signal' }, (payload) => {
            handleSignalingData(payload.payload);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Call signaling channel subscribed");
            }
        });
}

// Call this once on load
setTimeout(initCallChannel, 1000);

function sendSignal(targetUser, type, data) {
    if (!callChannel || !currentUser) return;
    callChannel.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: {
            from: currentUser.user_id,
            to: targetUser,
            type: type, // 'offer', 'answer', 'ice-candidate', 'decline', 'end'
            data: data
        }
    });
}

// Start Call
async function startCall(video = false) {
    if (!currentChat) {
        alert("Select a contact to call.");
        return;
    }
    
    isVideoCall = video;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
        
        // Show active call overlay immediately (Calling...)
        showActiveCallOverlay(currentChat, "Calling...");
        
        createPeerConnection(currentChat);

        // Add local tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        sendSignal(currentChat, 'offer', {
            sdp: peerConnection.localDescription,
            isVideo: isVideoCall,
            callerName: currentUser.name,
            callerAvatar: currentUser.avatar
        });
        
    } catch (err) {
        console.error("Error accessing media devices.", err);
        alert("Could not access camera or microphone. Please check permissions.");
    }
}

// Handle Incoming Signaling Data
async function handleSignalingData(payload) {
    // Only process signals meant for me
    if (payload.to !== currentUser.user_id) return;
    
    const { from, type, data } = payload;
    
    if (type === 'offer') {
        iceCandidateQueue = []; // Reset queue
        incomingCallData = { from, offer: data.sdp, isVideo: data.isVideo };
        showIncomingCallModal(data.callerName, data.callerAvatar, data.isVideo);
    } 
    else if (type === 'answer') {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            document.getElementById("callDuration").innerText = "Connected";
            
            // Process queued candidates
            for (let candidate of iceCandidateQueue) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
            }
            iceCandidateQueue = [];
        }
    } 
    else if (type === 'ice-candidate') {
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error("Error adding received ice candidate", e);
            }
        } else {
            // Queue if remoteDescription is not yet set
            iceCandidateQueue.push(data.candidate);
        }
    }
    else if (type === 'decline') {
        alert("Call declined.");
        cleanupCall();
    }
    else if (type === 'end') {
        cleanupCall();
    }
}

// Accept Call
async function acceptCall() {
    if (!incomingCallData) return;
    
    hideIncomingCallModal();
    isVideoCall = incomingCallData.isVideo;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
        
        showActiveCallOverlay(incomingCallData.from, "Connecting...");
        
        createPeerConnection(incomingCallData.from);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        
        // Process queued ice candidates correctly
        for (let candidate of iceCandidateQueue) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
        }
        iceCandidateQueue = [];
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSignal(incomingCallData.from, 'answer', {
            sdp: peerConnection.localDescription
        });
        
        document.getElementById("callDuration").innerText = "Connected";

    } catch (err) {
        console.error("Error accepting call", err);
        alert("Could not access camera or microphone.");
        cleanupCall();
    }
}

// Decline Call
function declineCall() {
    if (incomingCallData) {
        sendSignal(incomingCallData.from, 'decline', null);
        incomingCallData = null;
    }
    hideIncomingCallModal();
}

// End Call
function endCall() {
    if (currentChat) {
        sendSignal(currentChat, 'end', null);
    } else if (incomingCallData) {
        sendSignal(incomingCallData.from, 'end', null);
    }
    cleanupCall();
}

function createPeerConnection(targetUser) {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendSignal(targetUser, 'ice-candidate', { candidate: event.candidate });
        }
    };

    peerConnection.ontrack = event => {
        const remoteVideoEl = document.getElementById('remoteVideo');
        if (event.streams && event.streams[0]) {
            remoteStream = event.streams[0];
            if (remoteVideoEl) {
                remoteVideoEl.srcObject = remoteStream;
            }
        } else {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                if (remoteVideoEl) {
                    remoteVideoEl.srcObject = remoteStream;
                }
            }
            remoteStream.addTrack(event.track);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            cleanupCall();
        }
    };
}

function cleanupCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    iceCandidateQueue = [];
    incomingCallData = null;
    
    const localVideoEl = document.getElementById('localVideo');
    const remoteVideoEl = document.getElementById('remoteVideo');
    if (localVideoEl) localVideoEl.srcObject = null;
    if (remoteVideoEl) remoteVideoEl.srcObject = null;
    
    hideActiveCallOverlay();
}

// UI Helpers
function showIncomingCallModal(callerName, callerAvatar, isVideo) {
    document.getElementById("incomingCallModal").classList.remove("hidden");
    document.getElementById("callerName").innerText = callerName || "Unknown User";
    document.getElementById("callerAvatar").src = callerAvatar || "../material/images/default-avatar.png";
    document.getElementById("callTypeText").innerText = isVideo ? "Video" : "Voice";
}

function hideIncomingCallModal() {
    document.getElementById("incomingCallModal").classList.add("hidden");
}

function showActiveCallOverlay(userId, statusText) {
    document.getElementById("activeCallOverlay").classList.remove("hidden");
    
    // Set Local Video Stream
    const localVideoEl = document.getElementById("localVideo");
    if (localVideoEl && localStream) {
        localVideoEl.srcObject = localStream;
        if (!isVideoCall) {
            localVideoEl.classList.add("hidden");
        } else {
            localVideoEl.classList.remove("hidden");
        }
    }
    
    // Fetch Name/Avatar for Active Call
    const chatItem = document.getElementById(`chat-item-${userId}`);
    let targetName = "Unknown";
    let targetAvatar = "../material/images/default-avatar.png";
    if (chatItem) {
        const nameEl = chatItem.querySelector(".chat-name span");
        const imgEl = chatItem.querySelector("img");
        if (nameEl) targetName = nameEl.innerText;
        if (imgEl) targetAvatar = imgEl.src;
    } else if (incomingCallData) {
        // Fallback for incoming
        targetName = document.getElementById("callerName").innerText;
        targetAvatar = document.getElementById("callerAvatar").src;
    }
    
    document.getElementById("activeCallName").innerText = targetName;
    document.getElementById("callDuration").innerText = statusText;
    
    const audioPlaceholder = document.getElementById("audioOnlyPlaceholder");
    const remoteVideoEl = document.getElementById("remoteVideo");
    
    if (!isVideoCall) {
        // Voice only
        audioPlaceholder.classList.remove("hidden");
        document.getElementById("activeCallAvatar").src = targetAvatar;
        remoteVideoEl.classList.add("hidden");
    } else {
        // Video
        audioPlaceholder.classList.add("hidden");
        remoteVideoEl.classList.remove("hidden");
    }
}

function hideActiveCallOverlay() {
    document.getElementById("activeCallOverlay").classList.add("hidden");
}

// Media Toggles
function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const icon = document.querySelector("#btnToggleAudio i");
            if (audioTrack.enabled) {
                icon.className = "fas fa-microphone";
                document.getElementById("btnToggleAudio").classList.remove("btn-danger");
                document.getElementById("btnToggleAudio").classList.add("btn-light");
            } else {
                icon.className = "fas fa-microphone-slash";
                document.getElementById("btnToggleAudio").classList.remove("btn-light");
                document.getElementById("btnToggleAudio").classList.add("btn-danger");
            }
        }
    }
}

function toggleVideo() {
    if (localStream && isVideoCall) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const icon = document.querySelector("#btnToggleVideo i");
            if (videoTrack.enabled) {
                icon.className = "fas fa-video";
                document.getElementById("btnToggleVideo").classList.remove("btn-danger");
                document.getElementById("btnToggleVideo").classList.add("btn-light");
            } else {
                icon.className = "fas fa-video-slash";
                document.getElementById("btnToggleVideo").classList.remove("btn-light");
                document.getElementById("btnToggleVideo").classList.add("btn-danger");
            }
        }
    }
}
