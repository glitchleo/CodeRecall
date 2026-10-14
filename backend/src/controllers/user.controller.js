import { User } from "../models/user.model.js";

const registerUser = async (req, res) => {
    try {
        const {username, email, password} = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({message: "All field must be filled"});
        }

        const existing = await User.findOne({email: email.toLowerCase()});

        if (existing) {
            return res.status(400).json({message: "User already exists"});
        }

        const user = await User.create({
            username,
            email: email.toLowerCase(),
            password,
            loggedIn:false
        });

        res.status(201).json({message: "User created", user});
    } catch (error) {
        res.status(500).json({message: "Internal server error"});
    }
}


const loginUser = async (req,res) => {
    try {

        const {email, password} = req.body;

        const user = await User.findOne({email: email.toLowerCase()});

        if (!user) {
            return res.status(400).json({message: "User not found"});
        }


        const isMatch = await user.comparePassword(password);
        if(!isMatch){
            return res.status(400).json({message: "Wrong Password"});
        }

        res.status(200).json({
            message: "User logged in",
            user: {
                id: user._id,
                email: user.email,
                username: user.username
            }

        });
    } catch (error) {   
        res.status(500).json({message: "Internal server error"});
    }
}

const logoutUser = async (req,res) => {
    try {
        const {email} = req.body;

        const user = await User.findOne({email: email.toLowerCase()});
        
        res.status(200).json({
            message: "User logged out successfully",

            user: {
                id:user._id,
                email:user.email,
                username:user.username
            }
        });

    }catch (error) {
        res.status(500).json({message: "Internal server error"});
    }
}
export {registerUser, loginUser, logoutUser};