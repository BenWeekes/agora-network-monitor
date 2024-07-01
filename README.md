
## AgoraRTCNetEx.js
This javascript module provides an 'Out of band' network monitor to work along side AgoraRTC 4.x SDK.
It is able to report the true uplink/downlink of each host in the channel.       
It does not revert to 'Good' if packet losses reduce while the bitrate is lowered in full path feedback mode.       
It does not confuse my downlink with your uplink.        


#### Include the javascript:

         <script src="./AgoraRTCNetEx.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the optimizeNetworkControl() method.         
Pass in the min and max bit rates that you wish the high stream encoder to move between and which match those of your selected profile.     
  
## Function arguments      

<pre>

AgoraRTCNetEx.monitorNetwork(client, targetBitrate);

client         The AgoraRTC client object returned from createClient method.     
targetBitrate  The target/max bitrate a client will publish video at. 
</pre>


#### Web Demo
https://sa-utils.agora.io/agora-network-monitor/index.html

#### Demo Videos

Mac - Mac
https://drive.google.com/file/d/1KQ2kqxnAGQdyVxYBc7jX5khIwyF7vMqw/view?usp=sharing


Mac - iOS 
https://drive.google.com/file/d/10TJpSpex5E_baM26rqxnb1d9alIyA7lS/view?usp=sharing


#### Further enhancements   
Test further when more than 2 hosts publishing in channel.      
Switch subscriber to low stream if inbound bitrate below br_min.    

