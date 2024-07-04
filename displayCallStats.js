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

let dualStream=false;
let statsInterval;

// the demo can auto join channel with params in url
$(() => {
  var urlParams = new URL(location.href).searchParams;
  options.appid = urlParams.get("appid");
  options.channel = urlParams.get("channel");
  options.token = urlParams.get("token");
  options.uid = urlParams.get("uid");
  dualStream=('true'==urlParams.get("dualStream"));
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

function networkUpdate(stats) {
  console.log('networkUpdate',stats);
}

let _netlocal;

function networkUpdateA(stats) {
  _netlocal=stats;
  console.log('networkUpdateA',stats);
}


async function join() {
  // add event listener to play remote tracks when remote user publishs.
  if (dualStream){
    client.enableDualStream();
  }
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  AgoraRTCNetExEvents.on("network-quality",networkUpdate);
  client.on("network-quality",networkUpdateA);
  client.getRemoteNetworkQuality();

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
    if (dualStream) {
      client.setStreamFallbackOption(uid,2);
    }
    
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
  //flushStats();
}

// stop collect and show stats information
function destructStats() {
  clearInterval(statsInterval);
  $("#session-stats").html("");
  $("#transport-stats").html("");
  $("#local-stats").html("");
}
function displayAgoraQuality(quality) {

  switch (quality) {
    case 1:
      return 'Excellent';
      break;
    case 2:
      return 'Good';
      break;
    case 3:
      return 'Average';
      break;
    case 4:
      return 'Poor';
      break;
    case 5:
      return 'Critical';
      break;
    case 6:
      return 'Critical';
      break;
    default:
      return 'Unknown';
  }


}
// flush stats views
function flushStats() {
  // get the client stats message
  const clientStats = client.getRTCStats();
  const clientNetworkStats = AgoraRTCNetEx.getNetworkStats();
  
  const clientNetworkStatsList = [
    { description: "Uplink Stats", value: "", unit: "" },
    { description: "targetBitrate", value: clientNetworkStats.targetBitrate, unit: "kbps" },
    { description: "bitrate outbound", value: Math.floor(clientStats.SendBitrate/1000), unit: "kbps" },
    { description: "outboundEstimatedBitrate", value: clientNetworkStats.outboundEstimatedBitrate, unit: "kbps" },
    { description: "nackRateOutboundMax", value: clientNetworkStats.nackRateOutboundMax, unit: "%" },
    { description: "", value: "", unit: "" },
    { description: "Nex uplink", value: clientNetworkStats.uplink, unit: "" },
    { description: "SDK uplink", value: displayAgoraQuality(_netlocal?.uplinkNetworkQuality), unit: "" },
  ]

  const clientNetworkStatsList2 = [
    { description: "Downlink Stats", value: "", unit: "" },
    { description: "remote user count", value: clientNetworkStats.remoteSubCount, unit: "" },
    { description: "bitrate inbound", value: Math.floor(clientStats.RecvBitrate/1000), unit: "kbps" },
    { description: "lossAgAudioVideoInboundAvg", value: clientNetworkStats.lossAgAudioVideoInboundAvg, unit: "" },
    { description: "lossAgAudioVideoInboundAvgAdjust", value: clientNetworkStats.lossAgAudioVideoInboundAvgAdjust, unit: "" },
    { description: "", value: "", unit: "" },
    { description: "Nex downlink", value: clientNetworkStats.downlink, unit: "" },
    { description: "SDK downlink", value: displayAgoraQuality(_netlocal?.downlinkNetworkQuality), unit: "" },
  ]
  $("#client-stats").html(`
    ${clientNetworkStatsList.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
  `)

  $("#client-stats2").html(`
    ${clientNetworkStatsList2.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
  `)
   const localStatsList = [
  ];
  $("#local-stats").html(`
    ${localStatsList.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
  `);

  let _userStatsMap=AgoraRTCNetEx.getRemoteNetworkStats();
  let ag=client.getRemoteNetworkQuality();
console.log('ag.remote',client.getRemoteNetworkQuality());
  //console.log(_userStatsMap);

  Object.keys(remoteUsers).forEach(uid => {
    const remoteTracksStatsList = [
      { description: "Nex Uplink", value: _userStatsMap[uid].uplink, unit: "" },
      { description: "Nex   Downlink", value: _userStatsMap[uid].downlink, unit: "" },
      //{ description: "lastPacketsLost", value: _userStatsMap[uid].lastPacketsLost, unit: "" },
      //{ description: "nackRate", value: _userStatsMap[uid].nackRate, unit: "" },
    //  { description: "packetsLost", value: _userStatsMap[uid].packetsLost, unit: "" },
      
      { description: "", value: "", unit: "" },
      { description: "SDK Uplink", value: displayAgoraQuality(ag[uid].uplinkNetworkQuality), unit: "" },
      { description: "SDK Downlink", value: displayAgoraQuality(ag[uid].downlinkNetworkQuality), unit: "" },
    ];
    $(`#player-wrapper-${uid} .track-stats`).html(`
      ${remoteTracksStatsList.map(stat => `<p class="stats-row">${stat.description}: ${stat.value} ${stat.unit}</p>`).join("")}
    `);
  });
}
