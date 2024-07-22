import React, { useState, useRef, useEffect } from 'react';
import { View, Button, StyleSheet, ScrollView, Dimensions, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import axios from 'axios';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');

const App = () => {
  const [video, setVideo] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [landingAnalysis, setLandingAnalysis] = useState([]);
  const [hipDropAnalysis, setHipDropAnalysis] = useState([]);
  const [bodyLeanAnalysis, setBodyLeanAnalysis] = useState([]);
  const [verticalBounceAnalysis, setVerticalBounceAnalysis] = useState([]);
  const [mostFrequentLanding, setMostFrequentLanding] = useState(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);

  const connections = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
    [5, 7], [6, 8], [7, 9], [8, 10],
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27,31], [28,32]
  ];

  const pickVideo = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setVideo(result.assets[0].uri);
    }
  };

  const detectPose = async () => {
    if (!video) {
      console.log('No video selected');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('video', {
      uri: video,
      type: 'video/mp4',
      name: 'video.mp4',
    });

    try {
      const response = await axios.post('http://192.168.0.106:5000/detect_pose', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
      });

      setResult(response.data);
      setLandmarks(response.data.landmarks || []);
      setLandingAnalysis(response.data.landing_analysis || []);
      setHipDropAnalysis(response.data.hipdrop_analysis || []);
      setBodyLeanAnalysis(response.data.body_lean_analysis || []);
      setVerticalBounceAnalysis(response.data.vertical_bounces || []);
      setMostFrequentLanding(response.data.most_frequent_landing_type || null);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  const updateCurrentFrameIndex = async () => {
    if (videoRef.current) {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        const currentTime = status.positionMillis;
        const frameIndex = Math.floor(currentTime / 1000 * 30);
        setCurrentFrameIndex(frameIndex);
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(updateCurrentFrameIndex, 1000 / 30);
    return () => clearInterval(interval);
  }, [video]);

  const currentLandmarks = landmarks[currentFrameIndex] || [];
  const currentLanding = landingAnalysis[currentFrameIndex] || {};
  const currentHipDrop = hipDropAnalysis[currentFrameIndex] || {};
  const currentBodyLean = bodyLeanAnalysis[currentFrameIndex] || {};
  const currentVerticalBounce = verticalBounceAnalysis[currentFrameIndex] || 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="Upload a Video" onPress={pickVideo} />
      {video && (
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: video }}
            rate={1.0}
            volume={0}
            isMuted={false}
            resizeMode="contain"
            shouldPlay
            isLooping
            style={styles.video}
          />
          <Button title="Detect Pose" onPress={detectPose} />
          <Svg height={styles.video.height} width={styles.video.width} style={styles.svg}>
            {currentLandmarks.map((landmark, index) => (
              <Circle
                key={index}
                cx={landmark.x * styles.video.width}
                cy={landmark.y * styles.video.height}
                r="3"
                fill="red"
              />
            ))}
            {connections.map(([start, end], index) => {
              const startLandmark = currentLandmarks[start];
              const endLandmark = currentLandmarks[end];
              if (startLandmark && endLandmark) {
                return (
                  <Line
                    key={index}
                    x1={startLandmark.x * styles.video.width}
                    y1={startLandmark.y * styles.video.height}
                    x2={endLandmark.x * styles.video.width}
                    y2={endLandmark.y * styles.video.height}
                    stroke="green"
                    strokeWidth="2"
                  />
                );
              }
              return null;
            })}
            {currentLanding && currentLanding.ground_assump !== undefined && (
              <Line
                x1="0%"
                y1={currentLanding.ground_assump * styles.video.height}
                x2="100%"
                y2={currentLanding.ground_assump * styles.video.height}
                stroke="blue"
                strokeWidth="2"
              />
            )}
            {currentHipDrop && (
              <SvgText
                x={(currentLandmarks[23]?.x * styles.video.width || 0) + 30}
                y={(currentLandmarks[24]?.y * styles.video.height || 0) - 5}
                fill="black"
                fontSize="12"
                fontWeight="bold"
              >
                {currentHipDrop.significant ? 'Hip Dropped' : 'No Hip Drop'}
              </SvgText>
            )}
            {currentBodyLean && currentBodyLean.text && (
              <SvgText
                x={(currentLandmarks[0]?.x * styles.video.width || 0) + 10}
                y={currentLandmarks[0]?.y * styles.video.height || 0}
                fill={(currentBodyLean.text === "Forward Lean"||currentBodyLean.text === "Backward Lean") ? "red" : "green"}
                fontSize="12"
                fontWeight="bold"
              >
                {currentBodyLean.text} - {currentBodyLean.angle.toFixed(2)}°
              </SvgText>
            )}
            {mostFrequentLanding && (           
                <SvgText
                x={(currentLandmarks[23]?.x * styles.video.width || 0) + 30}
                y={(currentLandmarks[24]?.y * styles.video.height || 0) + 30}
                  fill="purple"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {mostFrequentLanding}
                </SvgText>   
            )}
            {currentVerticalBounce !== undefined && (
              <SvgText
                x={styles.video.width / 6}
                y={styles.video.height - 190}
                fill={currentVerticalBounce <= 0.08 ? "blue" : "red"}
                fontSize="12"
                fontWeight="bold"
              >
                Vertical Bounce: {currentVerticalBounce.toFixed(2)}
              </SvgText>
            )}
          </Svg>
          {loading && <Text>Loading...</Text>}
          {currentLanding && result && (
            <View style={styles.analysisContainer}>
              <Text>Left Landing Type: {currentLanding.left_landing_type}</Text>
              <Text>Right Landing Type: {currentLanding.right_landing_type}</Text>
              <Text>Landing Type: {result.most_frequent_landing_type}</Text>
              <Text>Hip Drop: {currentHipDrop.significant ? 'Detected' : 'None'}</Text>
              <Text>Body Lean: {currentBodyLean.text}</Text>
              <Text>Vertical Bounce: {currentVerticalBounce.toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  videoContainer: {
    position: 'relative',
  },
  video: {
    width: screenWidth,
    height: (screenWidth * 9) / 16, 
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  analysisContainer: {
    marginLeft: 20,
  },
});

export default App;