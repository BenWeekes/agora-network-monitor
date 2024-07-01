var AgoraRTCNetEx = (function () {


    /*
    Monitor my uplink and downlink
    share the status in channel 
    This is for full path feedback calls and also 


    Bad UPlink 
    Nack will show on local up and also on remote down
    More packet loss on local up than remote down 

    Bad Downlink
    Nack will only show on downlink
    Sender will be asked to reduce bitrate


    * We will need some Nack History for uplink and each downlink 

    We just want to know if our uplink or downlink is poor 

    For turning off camera we just need to be sending low for some time 
    For reducing profile we just need to be sending low for some time 

    - Reduce Profile 
    - Turn Camera Off
    - Report Network Quality Up and Down
        - FPF: my uplink can be determined by his downlink, check packet loss on up
        - Dual: my uplink can not be determined by his downlink
        - FPF: my downlink can be affected by his uplink
        - Dual: my downlink can be affected by his uplink


    Include audio PL

    // some kind of history to be used to decide where problem is while target rate is low 
    // check cam off, refresh remote 
    // broadcast: targetbitrate and important loss stats 
    // if >1 remote then low uplink is due to my uplink, downlink issues could still be related to pub uplink

    */
    const NetworkStatusGood = 0;
    const NetworkStatusFair = 1;
    const NetworkStatusPoor = 2;
    const NetworkStatusCritical = 3;

    var _rtc_clients = [];
    var _networkStatusMonitorFrequency = 1000;
    var _monitorStart = Date.now();
    var _monitorEnd = Date.now();
    var _targetBitrate;
    // calc uplink Nack
    let lastNackOutbound = 0;
    let lastStatsRead = 0;
    let lastPacketsSent = 0;

    var _userStatsMap = {};
    var _clientStatsMap = {};
    


    async function monitorNetworkStatus() {
        _monitorStart = Date.now();
        let clientStatsMapTemp = {
            remoteSubCount: 0,
            recvBitrate: 0,
            sendBitrate: 0,
            nackRateOutbound: 0,
            nackRateInboundAvg: 0,
            nackRateInboundMin: 0,
            lossRateInboundAvg: 0,
            lossRateInboundMin: 0,
            lossRateAgoraVideoInboundMin: 0,
            lossRateAgoraVideoInboundAvg: 0,
            lossRateAgoraAudioInboundMin: 0,
            lossRateAgoraAudioInboundAvg: 0,
            lossCountAgoraVideoInboundMin: 0,
            lossCountAgoraVideoInboundAvg: 0,
            lossCountAgoraAudioInboundMin: 0,
            lossCountAgoraAudioInboundAvg: 0,
            networkStatus: 0,
            statsRunTime: 0,
            currentPacketLossRate: 0,
            targetBitrate: 0,
            outboundEstimatedBitrate: 0,
            statsScheduleTime: 0,
            qualityLimitationReason: 'none',
        };
        clientStatsMapTemp.statsScheduleTime = _monitorStart - _monitorEnd;

        for (var i = 0; i < _rtc_clients.length; i++) {
            var client = _rtc_clients[i];
            if (client._p2pChannel.connection) {
                // outbound (uplink)
                const outboundStats = client.getLocalVideoStats();
                const clientStats = client.getRTCStats();
                const outboundBitrate = outboundStats.sendBitrate; // bps
                const outboundFrameRate = outboundStats.sendFrameRate; // fps
                const outboundResolutionWidth = outboundStats.sendResolutionWidth; // width
                const outboundResolutionHeight = outboundStats.sendResolutionHeight; // height

                await client._p2pChannel.connection.peerConnection.getStats().then(async stats => {
                    await stats.forEach(report => {
                        if (report.type === "outbound-rtp" && report.kind === "video") {
                            if (report.qualityLimitationReason) {
                                clientStatsMapTemp.qualityLimitationReason = report.qualityLimitationReason;
                            }
                            var now = Date.now();
                            var nack = report.nackCount
                            var packetsSent = report.packetsSent;
                            var nackChange = (nack - lastNackOutbound);
                            var packetChange = (packetsSent - lastPacketsSent);
                            var resetStats = false;
                            if (packetChange < 0) {
                                resetStats = true;
                            }
                            var timeDiff = now - lastStatsRead;
                            if (packetChange > 0 && nackChange > 0) {
                                clientStatsMapTemp.nackRateOutbound = Math.floor((nackChange / packetChange) * (timeDiff / 10));
                            }
                            lastNackOutbound = nack;
                            lastPacketsSent = packetsSent;
                            lastStatsRead = now;
                        }
                    })
                });

                clientStatsMapTemp.outboundEstimatedBitrate = clientStats.OutgoingAvailableBandwidth;
                clientStatsMapTemp.targetBitrate = _targetBitrate;
                clientStatsMapTemp.currentPacketLossRate = outboundStats.currentPacketLossRate;

                if (clientStatsMapTemp.outboundEstimatedBitrate * 1000 < _targetBitrate * 0.7) {
                    console.log("uplink network poor");
                } else {
                    console.log("uplink network good");
                }

                // inbounds (downlinks)
                for (var u = 0; u < client._users.length; u++) {
                    var uid = client._users[u].uid;
                    if (client._p2pChannel.connection.peerConnection && client.getRemoteVideoStats()[uid] && client._users[u].videoTrack && client._users[u].videoTrack._mediaStreamTrack) {
                        // check each remote user has last stats map
                        if (!_userStatsMap[uid]) {
                            _userStatsMap[uid] = {
                                uid: uid,
                                lastStatsRead: 0,
                                lastNack: 0,
                                nackRate: 0,
                                lossRate: 0,
                                packetChange: 0,
                                lastPacketsLost: 0,
                                receiveResolutionWidth: 0,
                                receiveResolutionHeight: 0,
                                receiveBitrate: 0,
                            };
                        }

                        await client._p2pChannel.connection.peerConnection.getStats(client._users[u].videoTrack._mediaStreamTrack).then(async stats => {
                            await stats.forEach(report => {
                                if (report.type === "inbound-rtp" && report.kind === "video") {
                                    var now = Date.now();
                                    var nack = report["nackCount"];
                                    var packetsReceived = report["packetsReceived"];
                                    var packetsLost = report["packetsLost"];
                                    var nackChange = (nack - _userStatsMap[uid].lastNack);
                                    var plChange = (packetsLost - _userStatsMap[uid].lastPacketsLost);
                                    var packetChange = ((packetsReceived + packetsLost) - _userStatsMap[uid].lastPacketsRecvd);
                                    var resetStats = false;
                                    if (packetChange < 0) {
                                        resetStats = true;
                                    }
                                    var timeDiff = now - _userStatsMap[uid].lastStatsRead;
                                    var nackRate = 0;
                                    var lossRate = 0;
                                    if (packetChange > 0 && nackChange > 0) {
                                        nackRate = Math.floor((nackChange / packetChange) * (timeDiff / 10));
                                    }
                                    if (packetChange > 0 && plChange > 0) {
                                        lossRate = Math.floor((plChange / packetChange) * (timeDiff / 10));
                                    }
                                    _userStatsMap[uid].lastStatsRead = now;
                                    _userStatsMap[uid].lastNack = nack;
                                    _userStatsMap[uid].lastPacketsLost = packetsLost;
                                    _userStatsMap[uid].nackRate = nackRate;
                                    _userStatsMap[uid].lossRate = lossRate;
                                    _userStatsMap[uid].lastPacketsRecvd = (packetsReceived + packetsLost);
                                    _userStatsMap[uid].packetChange = packetChange;
                                }
                            })
                        });

                        const remoteTracksStats = { video: client.getRemoteVideoStats()[uid], audio: client.getRemoteAudioStats()[uid] };
                       
                        if (remoteTracksStats.video.renderFrameRate) {
                            _userStatsMap[uid].renderFrameRate = Number(remoteTracksStats.video.renderFrameRate);
                        } else {
                            _userStatsMap[uid].renderFrameRate = 0;
                        }

                        /*
                        if (remoteTracksStats.video.receivePacketsLost) {
                            _userStatsMap[uid].lossRate = Number(remoteTracksStats.video.receivePacketsLost);
                        } else {
                            _userStatsMap[uid].lossRate = 0;
                        }*/

                        _userStatsMap[uid].receiveResolutionWidth = Number(remoteTracksStats.video.receiveResolutionWidth).toFixed(0);
                        _userStatsMap[uid].receiveResolutionHeight = Number(remoteTracksStats.video.receiveResolutionHeight).toFixed(0);
                        _userStatsMap[uid].receiveBitrate = Number(remoteTracksStats.video.receiveBitrate / 1000).toFixed(0);
                        if (_userStatsMap[uid].packetChange > 0) {
                            _userStatsMap[uid].totalDuration = Number(remoteTracksStats.video.totalDuration).toFixed(0);
                        } else {
                            _userStatsMap[uid].totalDuration = -1;
                        }

                        if (_userStatsMap[uid].packetChange > 0 && _userStatsMap[uid].totalDuration > 1) // when people drop they remain for a while
                        {
                            clientStatsMapTemp.remoteSubCount = clientStatsMapTemp.remoteSubCount + 1;
                            if (!Number.isNaN(_userStatsMap[uid].nackRate)) {
                                clientStatsMapTemp.nackRateInboundAvg = clientStatsMapTemp.nackRateInboundAvg + _userStatsMap[uid].nackRate;
                                if ((clientStatsMapTemp.nackRateInboundMin == 0 || _userStatsMap[uid].nackRate < clientStatsMapTemp.nackRateInboundMin)) {
                                    clientStatsMapTemp.nackRateInboundMin = _userStatsMap[uid].nackRate;
                                }
                            }
                            if (!Number.isNaN(_userStatsMap[uid].lossRate)) {
                                clientStatsMapTemp.lossRateInboundAvg = clientStatsMapTemp.lossRateInboundAvg + _userStatsMap[uid].lossRate;
                                if ((clientStatsMapTemp.lossRateInboundMin == 0 || _userStatsMap[uid].lossRate < clientStatsMapTemp.lossRateInboundMin)) {
                                    clientStatsMapTemp.lossRateInboundMin = _userStatsMap[uid].lossRate;
                                }
                            }
                        }

                        clientStatsMapTemp.lossRateAgoraVideoInboundAvg=clientStatsMapTemp.lossRateAgoraVideoInboundAvg+Math.floor(remoteTracksStats.video.packetLossRate);
                        if ((clientStatsMapTemp.lossRateAgoraVideoInboundMin == 0 || remoteTracksStats.video.packetLossRate < clientStatsMapTemp.lossRateAgoraVideoInboundMin)) {
                            clientStatsMapTemp.lossRateAgoraVideoInboundMin = Math.floor(remoteTracksStats.video.packetLossRate);
                        }
                        
                        clientStatsMapTemp.lossRateAgoraAudioInboundAvg=clientStatsMapTemp.lossCountAgoraAudioInboundAvg+Math.floor(remoteTracksStats.audio.packetLossRate);                       
                        if ((clientStatsMapTemp.lossRateAgoraAudioInboundMin == 0 || remoteTracksStats.audio.packetLossRate < clientStatsMapTemp.lossRateAgoraAudioInboundMin)) {
                            clientStatsMapTemp.lossRateAgoraAudioInboundMin = Math.floor(remoteTracksStats.audio.packetLossRate);
                        }

                        clientStatsMapTemp.lossCountAgoraVideoInboundAvg=clientStatsMapTemp.lossCountAgoraAudioInboundAvg+Math.floor(remoteTracksStats.video.receivePacketsLost);
                        if ((clientStatsMapTemp.lossCountAgoraVideoInboundMin == 0 || remoteTracksStats.video.receivePacketsLost < clientStatsMapTemp.lossCountAgoraVideoInboundMin)) {
                            clientStatsMapTemp.lossCountAgoraVideoInboundMin = Math.floor(remoteTracksStats.video.receivePacketsLost);
                        }
                        clientStatsMapTemp.lossCountAgoraAudioInboundAvg=clientStatsMapTemp.lossCountAgoraAudioInboundAvg+Math.floor(remoteTracksStats.audio.receivePacketsLost);
                        if ((clientStatsMapTemp.lossCountAgoraAudioInboundMin == 0 || remoteTracksStats.audio.receivePacketsLost < clientStatsMapTemp.lossCountAgoraAudioInboundMin)) {
                            clientStatsMapTemp.lossCountAgoraAudioInboundMin = Math.floor(remoteTracksStats.audio.receivePacketsLost);
                        }
                    }
                }
                if (clientStatsMapTemp.remoteSubCount>0) {
                    clientStatsMapTemp.nackRateInboundAvg = clientStatsMapTemp.nackRateInboundAvg / clientStatsMapTemp.remoteSubCount;
                    clientStatsMapTemp.lossRateInboundAvg = clientStatsMapTemp.lossRateInboundAvg / clientStatsMapTemp.remoteSubCount;    
                    clientStatsMapTemp.lossRateAgoraVideoInboundAvg = clientStatsMapTemp.lossRateAgoraVideoInboundAvg / clientStatsMapTemp.remoteSubCount;    
                    clientStatsMapTemp.lossRateAgoraAudioInboundAvg = clientStatsMapTemp.lossRateAgoraAudioInboundAvg / clientStatsMapTemp.remoteSubCount;    
                    clientStatsMapTemp.lossCountAgoraVideoInboundAvg = clientStatsMapTemp.lossCountAgoraVideoInboundAvg / clientStatsMapTemp.remoteSubCount;    
                    clientStatsMapTemp.lossCountAgoraAudioInboundAvg = clientStatsMapTemp.lossCountAgoraAudioInboundAvg / clientStatsMapTemp.remoteSubCount;    
                }
                
                clientStatsMapTemp.recvBitrate = clientStats.RecvBitrate;
                clientStatsMapTemp.sendBitrate = clientStats.SendBitrate;
            }
        }
        _monitorEnd = Date.now();
        clientStatsMapTemp.statsRunTime = (_monitorEnd - _monitorStart);
        _clientStatsMap = clientStatsMapTemp;

        // fire local to app
        AgoraRTCNetExEvents.emit("ClientVideoStatistics", _clientStatsMap);

        let NetworkStatus = NetworkStatusGood;
        // broadcast to others
        sendMessage(client, NetworkStatus, _clientStatsMap.RecvBitrate);
    }


    function sendMessage(client, status, bitrate) {
        var msg = 'bem';
        client.sendStreamMessage({ text: msg, payload: msg }).then(() => {
        }).catch(error => {
            console.error('AgoraRTM  send failure');
        });
    }

    function receiveMessage(senderId, data) {
        // console.log('receiveMessage',senderId, data);


        const textDecoder = new TextDecoder();

        // Decode the Uint8Array to a string
        const decodedText = textDecoder.decode(data);
        console.log('receiveMessage', senderId, decodedText);

    }

    return { // public interfaces
        monitorNetwork: function (client, targetBitrate) {
            _rtc_clients[0] = client;
            _targetBitrate = targetBitrate;
            client.on("stream-message", receiveMessage);
            setInterval(() => {
                monitorNetworkStatus();
            }, _networkStatusMonitorFrequency);
        },
        getNetworkStats: function () {
            return _clientStatsMap;
        },
        NetworkStatusGood: NetworkStatusGood,
        NetworkStatusFair: NetworkStatusFair,
        NetworkStatusPoor: NetworkStatusPoor,
        NetworkStatusCritical: NetworkStatusCritical,
    };
})();

var AgoraRTCNetExEvents = (function () {
    var events = {};
    function on(eventName, fn) {
        events[eventName] = events[eventName] || [];
        events[eventName].push(fn);
    }
    function off(eventName, fn) {
        if (events[eventName]) {
            for (var i = 0; i < events[eventName].length; i++) {
                if (events[eventName][i] === fn) {
                    events[eventName].splice(i, 1);
                    break;
                }
            }
        }
    }
    function emit(eventName, data) {
        if (events[eventName]) {
            events[eventName].forEach(function (fn) {
                fn(data);
            });
        }
    }
    return {
        on: on,
        off: off,
        emit: emit
    };
})();
