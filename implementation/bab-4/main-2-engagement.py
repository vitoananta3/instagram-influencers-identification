import torch
from PIL import Image
import json
import os
import math
from transformers import AlignProcessor, AlignModel
from typing import List, Dict, Tuple
import pandas as pd
import time
import numpy as np
import pickle
from tqdm import tqdm
import argparse
from torch.nn.functional import cosine_similarity
from datetime import timedelta
import sys

class Tee:
    """Redirect output to both terminal and file for logging"""
    def __init__(self, filename):
        self.terminal = sys.stdout
        self.file = open(filename, 'w', encoding='utf-8')
        
    def write(self, message):
        # Write to both terminal and log file
        self.terminal.write(message)
        self.file.write(message)
        self.file.flush()
        
    def flush(self):
        self.terminal.flush()
        self.file.flush()
        
    def close(self):
        self.file.close()

class PostProcessor:
    def __init__(self, result_dir="inti/model-result/", use_cache=True, use_checkpoint=True):
        start_time = time.time()
        
        # Initialize ALIGN model for image-text similarity
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        self.processor = AlignProcessor.from_pretrained("kakaobrain/align-base")
        self.model = AlignModel.from_pretrained("kakaobrain/align-base").to(self.device)
        
        # Set up data directories and cache paths
        self.images_dir = "dataset/images/"
        self.json_dir = "dataset/json/"
        self.profiles_dir = "dataset/profiles_influencers/"
        self.result_dir = result_dir
        self.cache_dir = os.path.join(self.result_dir, "cache/")
        self.use_cache = use_cache
        self.use_checkpoint = use_checkpoint
        
        # Create necessary directories
        os.makedirs(self.result_dir, exist_ok=True)
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # Define cache file paths
        self.image_embeddings_cache = os.path.join(self.cache_dir, "image_embeddings.pkl")
        self.caption_embeddings_cache = os.path.join(self.cache_dir, "caption_embeddings.pkl")
        self.checkpoint_path = os.path.join(self.cache_dir, "checkpoint.pkl")
        self.engagement_cache_path = os.path.join(self.cache_dir, "engagement_metrics.pkl")
        
        # Initialize caches
        self.image_embeddings = {}
        self.caption_embeddings = {}
        self.engagement_cache = {}
        self.load_cache()
        
        # Clean up existing checkpoint files if checkpoints are disabled
        if not self.use_checkpoint and os.path.exists(self.checkpoint_path):
            try:
                os.remove(self.checkpoint_path)
                print(f"Removed existing checkpoint file: {self.checkpoint_path}")
            except Exception as e:
                print(f"Warning: Could not remove checkpoint file: {e}")
        
        init_time = time.time() - start_time
        print(f"PostProcessor initialized in {format_time(init_time)}")
        print(f"Checkpoint usage: {'enabled' if self.use_checkpoint else 'disabled'}")
        
        self.follower_cache = {}

    def load_cache(self):
        """Load cached embeddings and metrics if available"""
        start_time = time.time()
        
        if not self.use_cache:
            return
            
        # Load image embeddings cache
        if os.path.exists(self.image_embeddings_cache):
            try:
                with open(self.image_embeddings_cache, 'rb') as f:
                    self.image_embeddings = pickle.load(f)
                print(f"Loaded {len(self.image_embeddings)} cached image embeddings")
            except Exception as e:
                print(f"Error loading image embeddings cache: {e}")
        
        # Load caption embeddings cache
        if os.path.exists(self.caption_embeddings_cache):
            try:
                with open(self.caption_embeddings_cache, 'rb') as f:
                    self.caption_embeddings = pickle.load(f)
                print(f"Loaded {len(self.caption_embeddings)} cached caption embeddings")
            except Exception as e:
                print(f"Error loading caption embeddings cache: {e}")
        

        
        # Load engagement metrics cache
        if os.path.exists(self.engagement_cache_path):
            try:
                with open(self.engagement_cache_path, 'rb') as f:
                    self.engagement_cache = pickle.load(f)
                print(f"Loaded {len(self.engagement_cache)} cached engagement metrics")
            except Exception as e:
                print(f"Error loading engagement cache: {e}")
        
        load_time = time.time() - start_time
        if self.use_cache and (len(self.image_embeddings) > 0 or len(self.caption_embeddings) > 0 or len(self.engagement_cache) > 0):
            print(f"Cache loading completed in {format_time(load_time)}")

    def save_cache(self):
        """Save all cached data to disk"""
        start_time = time.time()
        
        # Save image embeddings
        with open(self.image_embeddings_cache, 'wb') as f:
            pickle.dump(self.image_embeddings, f)
        
        # Save caption embeddings
        with open(self.caption_embeddings_cache, 'wb') as f:
            pickle.dump(self.caption_embeddings, f)
        

        
        # Save engagement metrics
        with open(self.engagement_cache_path, 'wb') as f:
            pickle.dump(self.engagement_cache, f)
        
        save_time = time.time() - start_time
        print(f"Cache saved successfully in {format_time(save_time)}")

    def save_checkpoint(self, processed_posts, brand_values, weights, results=None):
        """Save processing progress for resuming later"""
        if not self.use_checkpoint:
            print("Checkpoint saving disabled - skipping checkpoint save")
            return
            
        start_time = time.time()
        
        checkpoint = {
            'processed_posts': processed_posts,
            'brand_values': brand_values,
            'weights': weights,
            'results': results
        }
        with open(self.checkpoint_path, 'wb') as f:
            pickle.dump(checkpoint, f)
        
        checkpoint_time = time.time() - start_time
        print(f"Checkpoint saved at {self.checkpoint_path} in {format_time(checkpoint_time)}")

    def load_checkpoint(self):
        """Load previous checkpoint to resume processing"""
        if not self.use_checkpoint:
            print("Checkpoint loading disabled - starting fresh")
            return None
            
        start_time = time.time()
        
        if os.path.exists(self.checkpoint_path):
            try:
                with open(self.checkpoint_path, 'rb') as f:
                    checkpoint = pickle.load(f)
                
                checkpoint_time = time.time() - start_time
                print(f"Loaded checkpoint in {format_time(checkpoint_time)}")
                return checkpoint
            except Exception as e:
                print(f"Error loading checkpoint: {e}")
        return None

    def get_image_embedding(self, image_path):
        """Generate or retrieve cached ALIGN embedding for image"""
        if image_path in self.image_embeddings and self.use_cache:
            print(f"Image embedding from cache: {image_path}")
            return self.image_embeddings[image_path]
        
        try:
            print(f"Processing new image embedding: {image_path}")
            # Load and process image through ALIGN model
            image = Image.open(os.path.join(self.images_dir, image_path))
            inputs = self.processor(images=image, return_tensors="pt").to(self.device)
            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
            
            # Cache the embedding
            embedding = image_features.cpu().numpy()
            self.image_embeddings[image_path] = embedding
            return embedding
        except Exception as e:
            print(f"Error processing image {image_path}: {e}")
            return None

    def get_caption_embedding(self, caption_text):
        """Generate or retrieve cached ALIGN embedding for caption text"""
        if caption_text in self.caption_embeddings and self.use_cache:
            print(f"Caption embedding from cache: '{caption_text[:30]}...' (truncated)")
            return self.caption_embeddings[caption_text]
        
        try:
            print(f"Processing new caption embedding: '{caption_text[:30]}...' (truncated)")
            # Process caption text through ALIGN model
            inputs = self.processor(text=caption_text, return_tensors="pt", padding=True).to(self.device)
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
            
            # Cache the embedding
            embedding = text_features.cpu().numpy()
            self.caption_embeddings[caption_text] = embedding
            return embedding
        except Exception as e:
            print(f"Error processing caption text: {e}")
            return None
    
    def get_brand_embedding(self, brand_values):
        """Generate ALIGN embedding for brand values (no caching - not computationally expensive)"""
        try:
            print(f"Processing brand embedding: '{brand_values[:30]}...' (truncated)")
            # Process brand values through ALIGN model
            inputs = self.processor(text=brand_values, return_tensors="pt", padding=True).to(self.device)
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
            
            # Return embedding directly without caching
            embedding = text_features.cpu().numpy()
            return embedding
        except Exception as e:
            print(f"Error processing brand values: {e}")
            return None
    
    def get_follower_count(self, username):
        """Extract follower count from influencer profile"""
        if username in self.follower_cache:
            return self.follower_cache[username]
        
        try:
            profile_path = os.path.join(self.profiles_dir, username)
            if os.path.exists(profile_path):
                with open(profile_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        parts = line.strip().split('\t')
                        if len(parts) >= 2:
                            # Parse follower count from profile data
                            followers = int(parts[1].replace(',', ''))
                            self.follower_cache[username] = followers
                            return followers
            
            print(f"MISSING followers data for user {username}")
            return None
        except Exception as e:
            print(f"ERROR reading follower count for {username}: {e}")
            return None

    def extract_caption_from_json(self, json_filename):
        """Extract caption text from JSON file"""
        try:
            with open(os.path.join(self.json_dir, json_filename), 'r', encoding='utf-8') as f:
                json_data = json.load(f)
            
            # Extract caption text
            if 'edge_media_to_caption' in json_data and 'edges' in json_data['edge_media_to_caption']:
                edges = json_data['edge_media_to_caption']['edges']
                if edges and 'node' in edges[0] and 'text' in edges[0]['node']:
                    return edges[0]['node']['text']
            return ""
        except Exception as e:
            print(f"ERROR extracting caption from {json_filename}: {e}")
            return None

    def process_post(self, post_info):
        """Process single post: extract engagement, generate embeddings"""
        post_id, username, post_count, json_filename, image_files = post_info
        
        # Extract caption from JSON (always read from file, not cached in engagement_cache)
        caption = self.extract_caption_from_json(json_filename)
        if caption is None:
            return None
        
        # Check for cached engagement data
        if post_id in self.engagement_cache and self.use_cache:
            print(f"Engagement metrics from cache: {post_id}")
            engagement_data = self.engagement_cache[post_id]
            likes = engagement_data['likes']
            comments = engagement_data['comments']
            followers = engagement_data['followers']
        else:
            try:
                # Extract engagement data from JSON file
                with open(os.path.join(self.json_dir, json_filename), 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                
                likes = None
                comments = None
                
                # Extract likes count
                if 'edge_media_preview_like' in json_data and 'count' in json_data['edge_media_preview_like']:
                    likes = json_data['edge_media_preview_like']['count']
                
                # Extract comments count
                if 'edge_media_to_comment' in json_data and 'count' in json_data['edge_media_to_comment']:
                    comments = json_data['edge_media_to_comment']['count']
                    
                if likes is None:
                    print(f"MISSING likes data for post {post_id}")
                
                if comments is None:
                    print(f"MISSING comments data for post {post_id}")
                
            except Exception as e:
                print(f"ERROR loading JSON for post {post_id}: {e}")
                return None
            
            # Get follower count for engagement calculation
            followers = self.get_follower_count(username)
            
            # Cache engagement data without caption (caption has its own cache)
            self.engagement_cache[post_id] = {
                'likes': likes,
                'comments': comments, 
                'followers': followers
            }
        
        # Process all images and average their embeddings
        image_embeddings = []
        for img_file in image_files:
            embedding = self.get_image_embedding(img_file)
            if embedding is not None:
                image_embeddings.append(embedding)
        
        if not image_embeddings:
            print(f"No valid images for post {post_id}")
            return None
        
        # Average multiple image embeddings
        avg_image_embedding = np.mean(image_embeddings, axis=0)
        
        # Generate caption embedding
        caption_embedding = self.get_caption_embedding(caption)
        
        if caption_embedding is None:
            print(f"ERROR processing caption for post {post_id}")
            return None
            
        return {
            'post_id': post_id,
            'username': username,
            'likes': likes,
            'comments': comments,
            'followers': followers,
            'image_embedding': avg_image_embedding,
            'caption': caption,
            'caption_embedding': caption_embedding
        }

    def calculate_similarity(self, embedding1, embedding2):
        """Calculate cosine similarity between two embeddings"""
        embedding1_tensor = torch.tensor(embedding1)
        embedding2_tensor = torch.tensor(embedding2)
        
        # Normalize embeddings
        embedding1_tensor = embedding1_tensor / embedding1_tensor.norm(dim=-1, keepdim=True)
        embedding2_tensor = embedding2_tensor / embedding2_tensor.norm(dim=-1, keepdim=True)
        
        # Calculate cosine similarity
        similarity = cosine_similarity(embedding1_tensor, embedding2_tensor)
        return similarity.item()

    def process_posts(self, posts_file, brand_values, weights, output_filename="brand_match_results.csv", stop_flag=None):
        """Main processing function: calculate brand alignment scores for all posts"""
        total_start_time = time.time()
        
        print(f"Starting processing with brand values: {brand_values}")
        print(f"Using weights for final scores: content similarity={weights[0]}, engagement={weights[1]}")
        
        # Check for stop signal before proceeding
        if stop_flag and stop_flag.is_set():
            print("Job termination requested before processing started")
            return None
        
        brand_embed_start = time.time()
        
        # Generate brand values embedding
        print(f"Getting brand values embedding...")
        brand_embedding = self.get_brand_embedding(brand_values)
        if brand_embedding is None:
            print("Error processing brand values")
            return None
        
        # Check for stop signal after brand embedding
        if stop_flag and stop_flag.is_set():
            print("Job termination requested after brand embedding")
            return None
        
        brand_embed_time = time.time() - brand_embed_start
        print(f"Brand values processed in {format_time(brand_embed_time)}")
        
        posts_load_start = time.time()
        
        # Load posts data from file
        try:
            posts_df = pd.read_csv(posts_file, sep='\t', header=None, 
                                  names=['post_id', 'username', 'post_count', 'json_filename', 'image_files'])
            
            # Parse image files list from string
            posts_df['image_files'] = posts_df['image_files'].apply(lambda x: eval(x))
            
            posts_load_time = time.time() - posts_load_start
            print(f"Posts data loaded in {format_time(posts_load_time)}: {len(posts_df)} posts")
        except Exception as e:
            print(f"Error loading posts file: {e}")
            return None
        
        # Check for stop signal after loading posts
        if stop_flag and stop_flag.is_set():
            print("Job termination requested after loading posts data")
            return None
        
        checkpoint_start = time.time()
        
        # Check for existing checkpoint to resume processing
        checkpoint = self.load_checkpoint()
        processed_posts = []
        results = []
        
        if checkpoint and len(checkpoint['processed_posts']) > 0:
            processed_posts = checkpoint['processed_posts']
            if checkpoint['results']:
                results = checkpoint['results']
            processed_post_ids = {post['post_id'] for post in processed_posts}
            posts_df = posts_df[~posts_df['post_id'].isin(processed_post_ids)]
            
            checkpoint_time = time.time() - checkpoint_start
            print(f"Continuing from checkpoint with {len(processed_posts)} already processed posts in {format_time(checkpoint_time)}")
            print(f"Remaining posts to process: {len(posts_df)}")
        
        process_start = time.time()
        posts_processed = 0
        
        # Track engagement rates for normalization
        all_engagement_rates = []
        log_engagement_rates = []
        
        try:
            # Process each post and calculate similarities
            for _, row in tqdm(posts_df.iterrows(), total=len(posts_df), file=sys.stdout, desc="Processing posts"):
                # Check for stop signal at the beginning of each iteration
                if stop_flag and stop_flag.is_set():
                    print(f"\nJob termination requested. Processed {posts_processed} posts so far.")
                    # Save checkpoint before terminating
                    if processed_posts:
                        self.save_checkpoint(processed_posts, brand_values, weights, results)
                        self.save_cache()
                        print("Checkpoint saved before termination")
                    return None
                
                post_info = row.tolist()
                post_start_time = time.time()
                
                # Process individual post
                processed_post = self.process_post(post_info)
                
                if processed_post:
                    processed_posts.append(processed_post)
                    
                    # Calculate image-caption coherence
                    image_caption_similarity = self.calculate_similarity(
                        processed_post['image_embedding'], 
                        processed_post['caption_embedding']
                    )
                    
                    # Calculate image-brand similarity
                    image_brand_similarity = self.calculate_similarity(
                        processed_post['image_embedding'],
                        brand_embedding
                    )
                    
                    # Calculate caption-brand similarity
                    caption_brand_similarity = self.calculate_similarity(
                        processed_post['caption_embedding'],
                        brand_embedding
                    )
                    
                    # Calculate combined embedding similarity
                    combined_post_embedding = (processed_post['image_embedding'] + processed_post['caption_embedding']) / 2
                    
                    combined_brand_similarity = self.calculate_similarity(
                        combined_post_embedding,
                        brand_embedding
                    )
                    
                    # Weight brand similarity by content coherence
                    coherence_weighted_similarity = image_caption_similarity * combined_brand_similarity
                    
                    # Simple average of image and caption brand similarities
                    direct_combined_similarity = (image_brand_similarity + caption_brand_similarity) / 2
                    
                    # Extract engagement metrics
                    likes = processed_post.get('likes')
                    comments = processed_post.get('comments')
                    followers = processed_post.get('followers')
                    
                    engagement_rate = None
                    log_engagement = None
                    
                    # Calculate engagement rate and log transformation
                    if likes is not None and comments is not None and followers is not None and followers > 0:
                        engagement_rate = (likes + comments) / followers * 100
                        log_engagement = math.log(1 + engagement_rate)
                        
                        all_engagement_rates.append(engagement_rate)
                        log_engagement_rates.append(log_engagement)
                    
                    # Store all calculated metrics
                    results.append({
                        'post_id': processed_post['post_id'],
                        'username': processed_post['username'],
                        'likes': likes,
                        'comments': comments,
                        'followers': followers,
                        'engagement_rate': engagement_rate,
                        'log_engagement': log_engagement,
                        'image_caption_similarity': image_caption_similarity,
                        'image_brand_similarity': image_brand_similarity,
                        'caption_brand_similarity': caption_brand_similarity,
                        'direct_combined_similarity': direct_combined_similarity,
                        'coherence_weighted_similarity': coherence_weighted_similarity
                    })
                    
                    posts_processed += 1
                    post_time = time.time() - post_start_time
                    
                    # Progress reporting
                    if posts_processed % 5 == 0:
                        avg_time_per_post = (time.time() - process_start) / posts_processed
                        remaining_posts = len(posts_df) - posts_processed
                        estimated_time_left = avg_time_per_post * remaining_posts
                        
                        print(f"\nProcessed {posts_processed}/{len(posts_df)} posts. "
                              f"Last post in {format_time(post_time)}. "
                              f"Avg: {format_time(avg_time_per_post)}/post. "
                              f"Est. remaining: {format_time(estimated_time_left)}")
                
                # Periodic checkpoint saving
                if len(processed_posts) % 10 == 0 and posts_processed > 0:
                    self.save_checkpoint(processed_posts, brand_values, weights, results)
                    self.save_cache()
        
        except KeyboardInterrupt:
            print("Process interrupted. Saving checkpoint...")
            self.save_checkpoint(processed_posts, brand_values, weights, results)
            self.save_cache()
            
            total_time = time.time() - total_start_time
            print(f"Process interrupted after {format_time(total_time)}")
            return None
        
        process_time = time.time() - process_start
        if posts_processed > 0:
            avg_time_per_post = process_time / posts_processed
            print(f"Processed {posts_processed} posts in {format_time(process_time)}. "
                  f"Average: {format_time(avg_time_per_post)}/post.")
        
        finalize_start = time.time()
        
        # Normalize engagement scores and calculate final weighted scores
        if log_engagement_rates:
            min_log = min(log_engagement_rates)
            max_log = max(log_engagement_rates)
            log_range = max_log - min_log
            
            for result in results:
                if result['log_engagement'] is not None:
                    # Normalize engagement to 0-1 range
                    if log_range > 0:
                        normalized_engagement = (result['log_engagement'] - min_log) / log_range
                    else:
                        normalized_engagement = 0.5
                    
                    # Calculate weighted final scores
                    w1 = weights[0]
                    w2 = weights[1]
                    
                    result['normalized_engagement'] = normalized_engagement
                    result['final_coherence_score'] = (w1 * result['coherence_weighted_similarity']) + (w2 * normalized_engagement)
                    result['final_direct_score'] = (w1 * result['direct_combined_similarity']) + (w2 * normalized_engagement)
                else:
                    # Use only content similarity if engagement data missing
                    result['normalized_engagement'] = None
                    result['final_coherence_score'] = result['coherence_weighted_similarity']
                    result['final_direct_score'] = result['direct_combined_similarity']
        
        # Sort results by final coherence score
        results.sort(key=lambda x: x['final_coherence_score'] if x['final_coherence_score'] is not None else -1, reverse=True)
        
        # Save results to CSV
        results_df = pd.DataFrame(results)
        results_file = os.path.join(self.result_dir, output_filename)
        results_df.to_csv(results_file, index=False)
        
        finalize_time = time.time() - finalize_start
        print(f"Results sorted and saved to {results_file} in {format_time(finalize_time)}")
        
        # Clean up checkpoint file on successful completion (only if checkpoints are enabled)
        if self.use_checkpoint and os.path.exists(self.checkpoint_path):
            os.remove(self.checkpoint_path)
            print("Checkpoint file removed")
        
        self.save_cache()
        
        total_time = time.time() - total_start_time
        print(f"\nTotal processing completed in {format_time(total_time)}")
        
        return results_df

def format_time(seconds):
    """Convert seconds to human-readable time format"""
    return str(timedelta(seconds=int(seconds)))

def main():
    # Configuration settings
    result_dir = 'inti/model-result/'
    posts_file = 'dataset/post_34000_sampled_clean_info.txt'
    brand_values = 'adventure explore destination vacation journey wanderlust culture sightseeing landscape itinerary getaway passport photography backpacking'
    use_cache = True
    
    # Get user input for content similarity weight
    w1 = input("Enter weight for content similarity (0-1, default: 0.7): ").strip()
    try:
        w1 = float(w1) if w1 else 0.7
        if w1 < 0 or w1 > 1:
            print("Invalid weight. Using default 0.7.")
            w1 = 0.7
    except ValueError:
        print("Invalid input. Using default weight 0.7.")
        w1 = 0.7
    
    # Calculate engagement weight as complement
    w2 = 1 - w1
    print(f"Using weights: content similarity={w1:.2f}, engagement={w2:.2f}")
    weights = (w1, w2)
    
    # Get output filename from user
    output_filename = input("Enter output CSV filename (default: brand_match_results.csv): ").strip()
    if not output_filename:
        output_filename = "brand_match_results.csv"
    
    # Get log filename from user
    log_filename = input("Enter log filename to save terminal output (default: processing_log.txt): ").strip()
    if not log_filename:
        log_filename = "processing_log.txt"
    
    # Set up logging to file
    log_path = os.path.join(result_dir, log_filename)
    tee = Tee(log_path)
    sys.stdout = tee
    
    # Print configuration summary
    print("=" * 50)
    print(f"Starting brand matching process")
    print(f"Result directory: {result_dir}")
    print(f"Posts file: {posts_file}")
    print(f"Brand values: {brand_values}")
    print(f"Using cache: {use_cache}")
    print(f"Weights: content similarity={w1:.2f}, engagement={w2:.2f}")
    print(f"Output file: {output_filename}")
    print(f"Log file: {log_path}")
    print("=" * 50)
    
    start_time = time.time()
    
    try:
        # Initialize processor and run analysis
        processor = PostProcessor(result_dir=result_dir, use_cache=use_cache)
        results = processor.process_posts(posts_file, brand_values, weights, output_filename)
        
        # Display top results
        if results is not None:
            print("\nTop 5 matching posts:")
            print(results.head(5)[['post_id', 'username', 'final_coherence_score', 'coherence_weighted_similarity', 'normalized_engagement']])
        
        total_time = time.time() - start_time
        print(f"\nScript execution completed in {format_time(total_time)}")
        print("=" * 50)
    
    finally:
        # Restore stdout and close log file
        sys.stdout = tee.terminal
        tee.close()
        print(f"Log saved to: {log_path}")

if __name__ == "__main__":
    main()
      
