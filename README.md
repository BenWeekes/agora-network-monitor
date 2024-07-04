
## AgoraRTCNetEx.js
This javascript module provides an accurate network monitor to work along side AgoraRTC 4.x SDK.    
It is able to report the true uplink/downlink status of each host in the channel.       
It does not revert to 'Excellent' if the packet loss reduces when the bitrate is lowered in either Full Path Feedback or Dual Stream failover modes.      
It does not confuse Host A downlink with Host B uplink quality or vice versa.         


#### Include the javascript:

<script src="./AgoraRTCNetEx.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the optimizeNetworkControl() method.         
Pass in the min and max bit rates that you wish the high stream encoder to move between and which match those of your selected profile.     
  
## Initlialize       

<pre>
AgoraRTCNetEx.monitorNetwork(client, targetBitrate);

client         The AgoraRTC client object returned from createClient method.     
targetBitrate  The target/max bitrate a client will publish video at. 
</pre>

#### Usage
You can either call the methods 
<pre>
AgoraRTCNetEx.getNetworkStats();      
AgoraRTCNetEx.getRemoteNetworkStats();
</pre>
Or subscribe to events     
<pre>
AgoraRTCNetExEvents.on("NetworkUpdate",networkUpdate);
</pre>

#### Web Demo
https://sa-utils.agora.io/agora-network-monitor/index.html

#### Demo Videos


