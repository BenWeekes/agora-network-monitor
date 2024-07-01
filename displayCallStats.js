
//client.sendStreamMessage(payload: UInt8Array);
//To receive message:
//client.on("stream-message", (uid: UID, payload: UInt8Array) => {})


// create Agora client
var client = AgoraRTC.createClient({ mode: "rtc", codec: "vp9" });
AgoraRTC.enableLogUpload();
var localTracks = {
  videoTrack: null,
  audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: null,
  channel: null,
  uid: null,
  token: null
};

let statsInterval;

// the demo can auto join channel with params in url
$(() => {
  var urlParams = new URL(location.href).searchParams;
  options.appid = urlParams.get("appid");
  options.channel = urlParams.get("channel");
  options.token = urlParams.get("token");
  options.uid = urlParams.get("uid");
  if (options.appid && options.channel) {
    $("#uid").val(options.uid);
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
    $("#join-form").submit();
  }
})

$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  try {
    options.channel = $("#channel").val();
    options.uid = Number($("#uid").val());
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    await join();
    if (options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      $("#success-alert a").attr("href", `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`);
      $("#success-alert").css("display", "block");
    }
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
  }
})

$("#leave").click(function (e) {
  leave();
})


async function join() {
  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  // join the channel
  options.uid = await client.join(options.appid, options.channel, options.token || null, options.uid || null)
  if (!localTracks.audioTrack) {
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  }
  if (!localTracks.videoTrack) {
    localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: "720p_3" });
  }
  // play local video track
  localTracks.videoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);
  $("#joined-setup").css("display", "flex");

  // publish local tracks to channel
  AgoraRTCNetEx.monitorNetwork(client,2000);
  //AgoraRTCNetEx.monitorUplink(client, 500, 30, 1920, 1080);

  await client.publish(Object.values(localTracks));
  console.log("publish success");

  initStats();
}

async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  destructStats();

  // remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // leave the channel
  await client.leave();

  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#joined-setup").css("display", "none");
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === 'video') {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div class="player-with-stats">
          <div id="player-${uid}" class="player"></div>
          <div class="track-stats stats"></div>
        </div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === 'audio') {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user, mediaType) {
  if (mediaType === 'video') {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();

  }
}

// start collect and show stats information
function initStats() {
  statsInterval = setInterval(flushStats, 1000);
}

// stop collect and show stats information
function destructStats() {
  clearInterval(statsInterval);
  $("#session-stats").html("");
  $("#transport-stats").html("");
  $("#local-stats").html("");
}

// flush stats views
function flushStats() {
  // get the client stats message
  const clientStats = client.getRTCStats();
  const clientNetworkStats = AgoraRTCNetEx.getNetworkStats();
  
  const clientNetworkStatsList = [
    { description: "targetBitrate", value: clientNetworkStats.targetBitrate, unit: "kbps" },
    { description: "bitrate outbound", value: Math.floor(clientStats.SendBitrate/1000), unit: "kbps" },
    { description: "outboundEstimatedBitrate", value: clientNetworkStats.outboundEstimatedBitrate, unit: "kbps" },
    { description: "nackRateOutboundMax", value: clientNetworkStats.nackRateOutboundMax, unit: "%" },
    { description: "uplink", value: clientNetworkStats.uplink, unit: "" },

    { description: "", value: "", unit: "" },
    { description: "remote user count", value: clientNetworkStats.remoteSubCount, unit: "" },
    { description: "bitrate inbound", value: Math.floor(clientStats.RecvBitrate/1000), unit: "kbps" },
    { description: "lossCountAgoraAudioVideoInboundAvgMax", value: clientNetworkStats.lossCountAgoraAudioVideoInboundAvgMax, unit: "" },
    { description: "downlink", value: clientNetworkStats.downlink, unit: "" },
  ]
  $("#client-stats").html(`
    ${clientNetworkStatsList.map(stat => `<p class="stats-row"><b>${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
  `)
  // get the local track stats message
  //const localStats = { video: client.getLocalVideoStats(), audio: client.getLocalAudioStats() };
  const localStatsList = [
  ];
  $("#local-stats").html(`
    ${localStatsList.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
  `);

  let _userStatsMap=AgoraRTCNetEx.getRemoteNetworkStats();

  Object.keys(remoteUsers).forEach(uid => {
    // get the remote track stats message
    //const remoteTracksStats = { video: client.getRemoteVideoStats()[uid], audio: client.getRemoteAudioStats()[uid] };
    const remoteTracksStatsList = [

      { description: "Uplink", value: _userStatsMap[uid].uplink, unit: "" },
      { description: "Downlink", value: _userStatsMap[uid].downlink, unit: "" },
    ];
    $(`#player-wrapper-${uid} .track-stats`).html(`
      ${remoteTracksStatsList.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
    `);
  });
}
