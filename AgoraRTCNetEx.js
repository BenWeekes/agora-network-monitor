var AgoraRTCNetEx = (function () {

    /*
    Monitor my uplink and downlink & share local status in channel 
    This is for full path feedback calls and also dual stream enabled groups

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

    // if >1 remote then low uplink is due to
    // my uplink, downlink issues could still be related to pub uplink
    */
    const NetworkStatusExcellent = 'Excellent';
    const NetworkStatusGood = 'Good';
    const NetworkStatusAverage = 'Average';
    const NetworkStatusPoor = 'Poor';
    const NetworkStatusCritical = 'Critical';

    var _rtc_clients = [];
    var _networkStatusMonitorFrequency = 1000;

    var _targetBitrate;
    let lastNackOutbound = 0;
    let lastStatsRead = 0;
    let lastPacketsSent = 0;
    let nackRateOutboundMax = 0;
    let lossAgAudioVideoInboundAvgAdjust = 0;
    var _userStatsMap = {};
    var _clientStatsMap = {};

    async function monitorNetworkStatus() {
        _monitorStart = Date.now();
        let clientStatsMapTemp = {
            remoteSubCount: 0,
            lossAgAudioVideoInboundSum: 0,
            lossAgAudioVideoInboundAvg: 0,
           // lossWebRTCAudioVideoInboundSum: 0,
          //  lossWebRTCAudioVideoInboundAvg: 0,
            outboundEstimatedBitrate: 0,
            targetBitrate: 0,
            lossAgAudioVideoInboundAvgAdjust: 0,
            downlink: NetworkStatusExcellent,
            uplink: NetworkStatusExcellent,
        };

        for (var i = 0; i < _rtc_clients.length; i++) {
            var client = _rtc_clients[i];
            if (client._p2pChannel.connection) {
                // outbound (uplink)
               // const outboundStats = client.getLocalVideoStats();
                const clientStats = client.getRTCStats();
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
                            var timeDiff = now - lastStatsRead;
                            let nackRateOutbound = 0;
                            if (packetChange > 0 && nackChange > 0 && lastStatsRead >0) {
                                nackRateOutbound = Math.floor((nackChange / packetChange) * (timeDiff / 10));
                                if (nackRateOutbound > nackRateOutboundMax) {
                                    nackRateOutboundMax = nackRateOutbound;
                                }
                            }
                            lastNackOutbound = nack;
                            lastPacketsSent = packetsSent;
                            lastStatsRead = now;
                        }
                    })
                });

                clientStatsMapTemp.outboundEstimatedBitrate = Math.floor(clientStats.OutgoingAvailableBandwidth);
               // clientStatsMapTemp.currentPacketLossRate = outboundStats.currentPacketLossRate;

                // inbounds (downlinks)
                for (var u = 0; u < client._users.length; u++) {
                    var uid = client._users[u].uid;
                    if (client._p2pChannel.connection.peerConnection && client.getRemoteVideoStats()[uid] && client._users[u].videoTrack && client._users[u].videoTrack._mediaStreamTrack) {
                        // check each remote user has last stats map
                        if (!_userStatsMap[uid]) {
                            _userStatsMap[uid] = {
                                uid: uid,
                                packetsLost:0,
                                downlink: NetworkStatusExcellent,
                                uplink: NetworkStatusExcellent,
                            };
                        }

                        /*
                        await client._p2pChannel.connection.peerConnection.getStats(client._users[u].videoTrack._mediaStreamTrack).then(async stats => {
                            await stats.forEach(report => {
                           //     console.log('report',report.type,report.kind);

                                if (report.type === "inbound-rtp" && report.kind === "video") {
                                    if (!isNaN(report["packetsLost"])) {
                                        _userStatsMap[uid].packetsLost+=report["packetsLost"];
                                        clientStatsMapTemp.lossWebRTCAudioVideoInboundSum+=report["packetsLost"];
                                    }

                                    /*
                                    var now = Date.now();
                                    var nack = report["nackCount"];
                                    var packetsReceived = report["packetsReceived"];
                                    var packetsLost = report["packetsLost"];
                                    var nackChange = (nack - _userStatsMap[uid].lastNack);
                                    var plChange = (packetsLost - _userStatsMap[uid].lastPacketsLost);
                                    var packetChange = ((packetsReceived + packetsLost) - _userStatsMap[uid].lastPacketsRecvd);
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
                                    _userStatsMap[uid].packetsLost= report["packetsLost"];
                                    _userStatsMap[uid].nackRate = nackRate;
                                    _userStatsMap[uid].lossRate = lossRate;
                                    _userStatsMap[uid].lastPacketsRecvd = (packetsReceived + packetsLost);
                                    _userStatsMap[uid].packetChange = packetChange;
                                 
                                }
                            })
                        }); 
                        await client._p2pChannel.connection.peerConnection.getStats(client._users[u].audioTrack._mediaStreamTrack).then(async stats => {
                            await stats.forEach(report => {
                               // console.log('report',report.type,report.kind);
                                if (report.type === "inbound-rtp" && report.kind === "audio") {
                                    if (!isNaN(report["packetsLost"])) {
                                        clientStatsMapTemp.lossWebRTCAudioVideoInboundSum+=report["packetsLost"];
                                        _userStatsMap[uid].packetsLost+=report["packetsLost"];
                                    }

                                }
                            })
                        }); 
                           */
                        const remoteTracksStats = { video: client.getRemoteVideoStats()[uid], audio: client.getRemoteAudioStats()[uid] };
                        _userStatsMap[uid].packetsLost=( Math.floor(remoteTracksStats.video.receivePacketsLost)+ Math.floor(remoteTracksStats.audio.receivePacketsLost))
                        clientStatsMapTemp.remoteSubCount = clientStatsMapTemp.remoteSubCount + 1;
                        clientStatsMapTemp.lossAgAudioVideoInboundSum+=( Math.floor(remoteTracksStats.video.receivePacketsLost)+ Math.floor(remoteTracksStats.audio.receivePacketsLost));
                    }
                }

                if (clientStatsMapTemp.remoteSubCount > 0) {
                    //clientStatsMapTemp.lossWebRTCAudioVideoInboundAvg = clientStatsMapTemp.lossWebRTCAudioVideoInboundSum / clientStatsMapTemp.remoteSubCount;
                    clientStatsMapTemp.lossAgAudioVideoInboundAvg = clientStatsMapTemp.lossAgAudioVideoInboundSum / clientStatsMapTemp.remoteSubCount;
                }

                if (clientStats.RecvBitrate > 0.8 * _targetBitrate * 1000) {                    
                    lossAgAudioVideoInboundAvgAdjust=-1*clientStatsMapTemp.lossAgAudioVideoInboundAvg;
                } else {
                    // reset if necessary
                    if (clientStatsMapTemp.lossAgAudioVideoInboundAvg+lossAgAudioVideoInboundAvgAdjust < 0) {
                        lossAgAudioVideoInboundAvgAdjust=-1*clientStatsMapTemp.lossAgAudioVideoInboundAvg;
                    }
                    if (clientStatsMapTemp.lossAgAudioVideoInboundAvg+lossAgAudioVideoInboundAvgAdjust > 50) {
                        // my downlink bad
                        if (clientStats.RecvBitrate < 105000) {
                            clientStatsMapTemp.downlink = NetworkStatusCritical
                        } else if (clientStats.RecvBitrate < 0.3 * _targetBitrate * 1000) {
                            clientStatsMapTemp.downlink = NetworkStatusPoor
                        } else if (clientStats.RecvBitrate < 0.5 * _targetBitrate * 1000) {
                            clientStatsMapTemp.downlink = NetworkStatusAverage
                        } else if (clientStats.RecvBitrate < 0.8 * _targetBitrate * 1000) {
                            clientStatsMapTemp.downlink = NetworkStatusGood
                        }
                    }
                }
                clientStatsMapTemp.lossAgAudioVideoInboundAvgAdjust = lossAgAudioVideoInboundAvgAdjust;
                if (clientStats.OutgoingAvailableBandwidth > 0.8 * _targetBitrate) {
                    nackRateOutboundMax = 0;
                } else {
                    if (nackRateOutboundMax > 5) {
                        // my uplink bad
                        if (clientStats.OutgoingAvailableBandwidth < 105) {
                            clientStatsMapTemp.uplink = NetworkStatusCritical
                        } else if (clientStats.OutgoingAvailableBandwidth < 0.3 * _targetBitrate) {
                            clientStatsMapTemp.uplink = NetworkStatusPoor
                        } else if (clientStats.OutgoingAvailableBandwidth < 0.5 * _targetBitrate) {
                            clientStatsMapTemp.uplink = NetworkStatusAverage
                        } else if (clientStats.OutgoingAvailableBandwidth < 0.8 * _targetBitrate) {
                            clientStatsMapTemp.uplink = NetworkStatusGood
                        }
                    }
                }
                clientStatsMapTemp.nackRateOutboundMax = nackRateOutboundMax;
            }
        }
        clientStatsMapTemp.targetBitrate = _targetBitrate;
        _clientStatsMap = clientStatsMapTemp;
        // fire local to app
        // Create a Set to keep track of all valid uids
        for (var uid in _userStatsMap) {
            if (!client._users.some(user => user.uid == uid)) {
                delete _userStatsMap[uid];
            }
          }
        AgoraRTCNetExEvents.emit("NetworkUpdate", { "local": _clientStatsMap, "remote":_userStatsMap});
        // broadcast to others in channel
        sendMessage(client, '{"uplink":"' + clientStatsMapTemp.uplink + '", "downlink":"' + clientStatsMapTemp.downlink + '"}');
    }

    function sendMessage(client, message) {
        client.sendStreamMessage({ payload: message }).then(() => {
        }).catch(error => {
            console.error('AgoraRTM  send failure');
        });
    }

    function receiveMessage(senderId, data) {
        const textDecoder = new TextDecoder();
        const decodedText = textDecoder.decode(data);
        //console.log('receiveMessage', decodedText);
        const jsonObject = JSON.parse(decodedText);
        if (_userStatsMap[senderId]) {
            _userStatsMap[senderId].downlink = jsonObject.downlink;
            _userStatsMap[senderId].uplink = jsonObject.uplink;
        }
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
        getRemoteNetworkStats: function () {
            return _userStatsMap;
        },
        NetworkStatusGood: NetworkStatusGood,
        NetworkStatusExcellent: NetworkStatusExcellent,
        NetworkStatusAverage: NetworkStatusAverage,
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