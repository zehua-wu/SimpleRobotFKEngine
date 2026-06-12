import time
import math
from pathlib import Path

import mujoco
import mujoco.viewer


# -----------------------------
# Choose model
# -----------------------------

ROOT = Path(__file__).resolve().parents[1]

# For 2-DOF arm:
# URDF_PATH = ROOT / "model" / "assets" / "2_dof_arm.urdf"

# For 6-DOF arm:
URDF_PATH = ROOT / "model" / "assets" / "6_dof_arm.urdf"


# -----------------------------
# Load MuJoCo model
# -----------------------------

model = mujoco.MjModel.from_xml_path(str(URDF_PATH))
data = mujoco.MjData(model)

print("Loaded model:", URDF_PATH)
print("Number of qpos:", model.nq)
print("Number of joints:", model.njnt)
print("Number of bodies:", model.nbody)


print("Number of geoms:", model.ngeom)

for i in range(model.ngeom):
    print(i, mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, i))


# -----------------------------
# Helpers
# -----------------------------

def set_joint_angle(model, data, joint_name, angle):
    """
    Set a MuJoCo joint qpos by joint name.

    For a hinge joint, qpos has one scalar angle.
    """
    joint = model.joint(joint_name)
    qpos_id = joint.qposadr[0]
    data.qpos[qpos_id] = angle


def print_body_pose(data, body_name):
    """
    Print body world position and rotation matrix.
    """
    body = data.body(body_name)
    p = body.xpos
    R = body.xmat.reshape(3, 3)

    print(f"\nBody: {body_name}")
    print("position:", p)
    print("rotation:\n", R)


# -----------------------------
# Viewer loop
# -----------------------------

with mujoco.viewer.launch_passive(model, data) as viewer:
    t = 0.0

    while viewer.is_running():
        # Example joint motion.
        # For 2-DOF, only joint1 and joint2 exist.
        # For 6-DOF, joint1~joint6 exist.

        set_joint_angle(model, data, "joint1", 0.8 * math.sin(t))
        set_joint_angle(model, data, "joint2", 0.6 * math.sin(0.8 * t))

        # Uncomment these if using 6-DOF arm.
        if model.njnt >= 6:
            set_joint_angle(model, data, "joint3", 0.7 * math.sin(0.6 * t))
            set_joint_angle(model, data, "joint4", 1.0 * math.sin(1.2 * t))
            set_joint_angle(model, data, "joint5", 0.5 * math.sin(0.9 * t))
            set_joint_angle(model, data, "joint6", 1.2 * math.sin(1.5 * t))

        # Important:
        # mj_forward updates all body/site/geom poses from current qpos.
        # It does NOT step dynamics forward in time.
        mujoco.mj_forward(model, data)

        # Print end-effector pose occasionally.
        if int(t * 10) % 30 == 0:
            try:
                print_body_pose(data, "end_effector")
            except KeyError:
                pass

        viewer.sync()

        time.sleep(0.01)
        t += 0.01