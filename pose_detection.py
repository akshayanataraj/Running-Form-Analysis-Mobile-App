import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, request, jsonify
import math

app = Flask(__name__)

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

def calculate_angle(p1, p2, p3):
    angle = math.degrees(math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - math.atan2(p1[1] - p2[1], p1[0] - p2[0]))
    return angle + 360 if angle < 0 else angle

def is_foot_on_ground(heel_y, toe_y, ground_level, tolerance=0.02):
    return abs(heel_y - ground_level) < tolerance or abs(toe_y - ground_level) < tolerance


def analyze_body_lean(left_ear_x,left_ear_y,right_ear_x,right_ear_y,left_hip_x,left_hip_y,right_hip_x,right_hip_y):

    head_middle = ((left_ear_x + right_ear_x) / 2, (left_ear_y + right_ear_y) / 2)
    hip_middle = ((left_hip_x + right_hip_x) / 2, (left_hip_y + right_hip_y) / 2)

    vertical_point = (hip_middle[0], 0)

    body_lean_angle = calculate_angle(vertical_point, hip_middle, head_middle)
    if body_lean_angle > 180:
        body_lean_angle = 360 - body_lean_angle

    if body_lean_angle < 5:
        body_lean_text = "No lean"
    elif body_lean_angle < 60:
        body_lean_text = "Forward Lean"
    else:
        body_lean_text = "Backward Lean"

    return body_lean_text, body_lean_angle

def calculate_vertical_bounce(landmarks, previous_reference_hip_y):
    left_hip_y = landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]['y']
    right_hip_y = landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value]['y']
    hip_middle_y = (left_hip_y + right_hip_y) / 2

    if previous_reference_hip_y is None or is_foot_on_ground(
        landmarks[mp_pose.PoseLandmark.LEFT_HEEL.value]['y'],
        landmarks[mp_pose.PoseLandmark.LEFT_FOOT_INDEX.value]['y'],
        (left_hip_y + right_hip_y) / 2 
    ):
        reference_hip_y = hip_middle_y
    else:
        reference_hip_y = previous_reference_hip_y

    bounce_dist = abs(hip_middle_y - reference_hip_y)
    return bounce_dist, reference_hip_y

def process_video(video_path, buffer_size=10):
    cap = cv2.VideoCapture(video_path)
    landmarks = []
    landing_analysis = []
    hipdrop_analysis = []
    body_lean_analysis= []
    vertical_bounces = []
    previous_reference_hip_y = None

    ground_buffer = []
    landing_counts = {
        'frontfoot': 0,
        'heelfoot': 0,
        'midfoot': 0
    }

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(image)

        if results.pose_landmarks:
            frame_landmarks = []
            for landmark in results.pose_landmarks.landmark:
                frame_landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z
                })
            landmarks.append(frame_landmarks)

            left_heel_y = frame_landmarks[mp_pose.PoseLandmark.LEFT_HEEL.value]['y']
            right_heel_y = frame_landmarks[mp_pose.PoseLandmark.RIGHT_HEEL.value]['y']
            left_toe_y = frame_landmarks[mp_pose.PoseLandmark.LEFT_FOOT_INDEX.value]['y']
            right_toe_y = frame_landmarks[mp_pose.PoseLandmark.RIGHT_FOOT_INDEX.value]['y']

            max_y = max(left_heel_y, right_heel_y, left_toe_y, right_toe_y)
            ground_buffer.append(max_y)

            if len(ground_buffer) > buffer_size:
                ground_buffer.pop(0)

            ground_assump = np.mean(ground_buffer)

            left_landing_type = detect_landing_type(left_heel_y, left_toe_y, ground_assump)
            right_landing_type = detect_landing_type(right_heel_y, right_toe_y, ground_assump)

            landing_analysis.append({
                'ground_assump': ground_assump,
                'left_toe_y': left_toe_y,
                'left_heel_y': left_heel_y,
                'left_landing_type': left_landing_type,
                'right_toe_y': right_toe_y,
                'right_heel_y': right_heel_y,
                'right_landing_type': right_landing_type
            })

            # Update landing counts only if not 'none'
            if left_landing_type != 'none':
                landing_counts[left_landing_type] += 1
            if right_landing_type != 'none':
                landing_counts[right_landing_type] += 1

            left_hip_x = frame_landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]['x']
            left_hip_y = frame_landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]['y']
            right_hip_x = frame_landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value]['x']
            right_hip_y = frame_landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value]['y']
            hip_drop = abs(left_hip_y - right_hip_y)

            hipdrop_analysis.append({'hip_Drop': hip_drop, 'significant': hip_drop > 0.05})

            left_ear_x = frame_landmarks[mp_pose.PoseLandmark.LEFT_EAR.value]['x']
            left_ear_y = frame_landmarks[mp_pose.PoseLandmark.LEFT_EAR.value]['y']
            right_ear_x = frame_landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value]['x']
            right_ear_y = frame_landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value]['y']

            body_lean_text, body_lean_angle = analyze_body_lean(left_ear_x,left_ear_y,right_ear_x,right_ear_y,left_hip_x,left_hip_y,right_hip_x,right_hip_y)
            body_lean_analysis.append({
                'text': body_lean_text,
                'angle': body_lean_angle
            })

            bounce_dist, previous_reference_hip_y = calculate_vertical_bounce(frame_landmarks, previous_reference_hip_y)
            vertical_bounces.append(bounce_dist)

    cap.release()

    # Determine the most frequent landing type
    most_frequent_landing_type = max(landing_counts, key=landing_counts.get)

    return landmarks, landing_analysis, most_frequent_landing_type, hipdrop_analysis, body_lean_analysis, vertical_bounces

def detect_landing_type(heel_y, toe_y, ground_assump):
    if heel_y >= ground_assump and toe_y >= ground_assump:
        return 'midfoot'
    elif heel_y >= ground_assump:
        return 'heelfoot'
    elif toe_y >= ground_assump:
        return 'frontfoot'
    return 'none'

@app.route('/detect_pose', methods=['POST'])
def detect_pose():
    video = request.files['video']
    video_path = f"/tmp/{video.filename}"
    video.save(video_path)

    buffer_size = 13  # Adjust this value as needed for your tests
    landmarks, landing_analysis, most_frequent_landing_type, hipdrop_analysis, body_lean_analysis, vertical_bounces = process_video(video_path, buffer_size)

    return jsonify({
        'landmarks': landmarks,
        'landing_analysis': landing_analysis,
        'most_frequent_landing_type': most_frequent_landing_type,
        'hip_drop_analysis': hipdrop_analysis,
        'body_lean_analysis': body_lean_analysis,
        "vertical_bounces": vertical_bounces
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)