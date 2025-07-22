'use client';

import { useState, useEffect } from 'react';
import ConnectionStatus from '../components/ConnectionStatus';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ResultFile {
  filename: string;
  file_path: string;
  size: number;
  modified_time: number;
  created_time: number;
}

interface ResultRow {
  post_id: string;
  username: string;
  [key: string]: any; // For other CSV columns
}

interface PostInfo {
  post_id: string;
  username: string;
  json_file: string;
  image_files: string[];
}

interface PostMetadata {
  caption?: string;
  likes?: number;
  comments?: number;
  timestamp?: string;
  [key: string]: any;
}

interface Pagination {
  current_page: number;
  total_pages: number;
  total_items: number;
  items_per_page: number;
  has_next: boolean;
  has_previous: boolean;
}

// Define research categories and their URLs
const RESEARCH_CATEGORIES = [
  { name: 'beauty', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/beauty-093.csv' },
  { name: 'family', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/family-093.csv' },
  { name: 'fashion', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/fashion-093.csv' },
  { name: 'fitness', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/fitness-093.csv' },
  { name: 'food', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/food-093.csv' },
  { name: 'interior', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/interior-093.csv' },
  { name: 'pet', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/pet-093.csv' },
  { name: 'travel', url: 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public/results/travel-093.csv' },
];

export default function ResultViewer() {
  const [activeTab, setActiveTab] = useState<'local' | 'research'>('local');
  const [files, setFiles] = useState<ResultFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [postInfos, setPostInfos] = useState<PostInfo[]>([]);
  const [postMetadata, setPostMetadata] = useState<Record<string, PostMetadata>>({});
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<{ result: ResultRow, postInfo: PostInfo | undefined, metadata: PostMetadata | undefined, currentImageIndex?: number, rank?: number | null } | null>(null);

  const SUPABASE_BASE_URL = 'https://sqsfksneykcyhltfrhnr.supabase.co/storage/v1/object/public';
  const POST_INFO_URL = `${SUPABASE_BASE_URL}/posts/post_34000_sampled_clean_info.txt`;

  // Fetch result files for local tab
  useEffect(() => {
    if (activeTab === 'local') {
      fetchResultFiles();
    }
  }, [activeTab]);

  // Fetch post info when results change
  useEffect(() => {
    if (results.length > 0) {
      fetchPostInfo();
    }
  }, [results]);

  const fetchResultFiles = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/result-files');
      if (!response.ok) throw new Error('Failed to fetch result files');
      const data = await response.json();
      setFiles(data.files);
    } catch (err) {
      setError('Failed to load result files');
      console.error(err);
    }
  };

  const fetchFileResults = async (filename: string, page: number = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/result-files/${encodeURIComponent(filename)}/results?page=${page}&limit=10`);
      if (!response.ok) throw new Error('Failed to fetch results');
      const data = await response.json();

      // Backend now handles sorting by final_direct_score in descending order
      setResults(data.results);
      setPagination(data.pagination);
      setCurrentPage(page);
    } catch (err) {
      setError('Failed to load results');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResearchResults = async (categoryUrl: string, page: number = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(categoryUrl);
      if (!response.ok) throw new Error('Failed to fetch research results');
      const csvText = await response.text();

      // Parse CSV data
      const lines = csvText.split('\n');
      const headers = lines[0].split(',');

      // Process only the rows for the current page (simple client-side pagination)
      const itemsPerPage = 10;
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;

      const allResults: ResultRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',');
        const row: ResultRow = { post_id: '', username: '' };

        headers.forEach((header, index) => {
          const trimmedHeader = header.trim();
          if (values[index]) {
            row[trimmedHeader] = values[index].trim();

            // Ensure post_id and username are set
            if (trimmedHeader === 'post_id') row.post_id = values[index].trim();
            if (trimmedHeader === 'username') row.username = values[index].trim();
          }
        });

        allResults.push(row);
      }

      // Sort by final_direct_score if available
      allResults.sort((a, b) => {
        const scoreA = parseFloat(a.final_direct_score as string) || 0;
        const scoreB = parseFloat(b.final_direct_score as string) || 0;
        return scoreB - scoreA;
      });

      // Create pagination info
      const paginatedResults = allResults.slice(startIndex, endIndex);
      const totalItems = allResults.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      setResults(paginatedResults);
      setPagination({
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: itemsPerPage,
        has_next: page < totalPages,
        has_previous: page > 1
      });
      setCurrentPage(page);
    } catch (err) {
      setError('Failed to load research results');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPostInfo = async () => {
    setLoadingPosts(true);
    try {
      const response = await fetch(POST_INFO_URL);
      if (!response.ok) throw new Error('Failed to fetch post info');
      const text = await response.text();

      const postInfos: PostInfo[] = [];
      const lines = text.trim().split('\n');

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 5) {
          const post_id = parts[0];
          const username = parts[1];
          const json_file = parts[3];
          const image_files_str = parts[4];

          // Parse image files array
          let image_files: string[] = [];
          try {
            image_files = JSON.parse(image_files_str.replace(/'/g, '"'));
          } catch {
            // Fallback parsing
            image_files = image_files_str.replace(/[\[\]']/g, '').split(', ');
          }

          postInfos.push({
            post_id,
            username,
            json_file,
            image_files
          });
        }
      }

      setPostInfos(postInfos);

      // Fetch metadata for posts that are in current results
      const currentPostIds = results.map(r => r.post_id?.toString());
      const relevantPostInfos = postInfos.filter(p => currentPostIds.includes(p.post_id));

      for (const postInfo of relevantPostInfos) {
        fetchPostMetadata(postInfo.json_file, postInfo.post_id);
      }

    } catch (err) {
      console.error('Failed to fetch post info:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchPostMetadata = async (jsonFile: string, postId: string) => {
    try {
      const response = await fetch(`${SUPABASE_BASE_URL}/json/${jsonFile}`);
      if (!response.ok) return;
      const rawMetadata = await response.json();

      // Extract the data from the Instagram JSON structure
      const likes = rawMetadata?.edge_media_preview_like?.count || 0;
      const comments = rawMetadata?.edge_media_to_comment?.count || 0;

      // Extract caption text
      let caption = '';
      if (rawMetadata?.edge_media_to_caption?.edges?.length > 0) {
        caption = rawMetadata.edge_media_to_caption.edges[0]?.node?.text || '';
      }

      const processedMetadata = {
        likes,
        comments,
        caption,
        ...rawMetadata // Keep original data as well
      };

      setPostMetadata(prev => ({
        ...prev,
        [postId]: processedMetadata
      }));
    } catch (err) {
      console.error(`Failed to fetch metadata for ${jsonFile}:`, err);
    }
  };

  const handleFileSelect = (filename: string) => {
    setSelectedFile(filename);
    setSelectedCategory(''); // Clear selected category when selecting a file
    setCurrentPage(1);
    fetchFileResults(filename, 1);
  };

  const handleCategorySelect = (category: string) => {
    const selectedCategoryObj = RESEARCH_CATEGORIES.find(c => c.name === category);
    if (selectedCategoryObj) {
      setSelectedCategory(category);
      setSelectedFile(''); // Clear selected file when selecting a category
      setCurrentPage(1);
      fetchResearchResults(selectedCategoryObj.url, 1);
    }
  };

  const handlePageChange = (page: number) => {
    if (activeTab === 'local' && selectedFile) {
      fetchFileResults(selectedFile, page);
    } else if (activeTab === 'research' && selectedCategory) {
      const selectedCategoryObj = RESEARCH_CATEGORIES.find(c => c.name === selectedCategory);
      if (selectedCategoryObj) {
        fetchResearchResults(selectedCategoryObj.url, page);
      }
    }
  };

  const getPostInfo = (postId: string): PostInfo | undefined => {
    return postInfos.find(p => p.post_id === postId?.toString());
  };

  const getImageUrl = (imageFile: string): string => {
    return `${SUPABASE_BASE_URL}/images/${imageFile}`;
  };

  const formatScore = (score: any): string => {
    if (typeof score === 'number') {
      return score.toFixed(3);
    }
    return score?.toString() || 'N/A';
  };

  const truncateCaption = (caption: string, maxLength: number = 321): string => {
    if (caption.length <= maxLength) return caption;
    return caption.substring(0, maxLength) + '...';
  };

  const openPostDetail = (result: ResultRow, postInfo: PostInfo | undefined, metadata: PostMetadata | undefined) => {
    // Calculate the rank number based on current page and index
    const rankNumber = pagination ? ((pagination.current_page - 1) * pagination.items_per_page) + results.findIndex(r => r.post_id === result.post_id) : null;
    setSelectedPost({ result, postInfo, metadata, currentImageIndex: 0, rank: rankNumber });
  };

  const closePostDetail = () => {
    setSelectedPost(null);
  };

  return (
    <div className="space-y-6 p-6">
      <ConnectionStatus />

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Instagram Post Results Viewer</h1>

        {/* Tabs for Local and Research */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'local' | 'research')} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local">Local</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="mt-4">
            {/* File Selection for Local Tab */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select a result file:
              </label>
              <select
                value={selectedFile}
                onChange={(e) => handleFileSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a result file...</option>
                {files.map((file) => (
                  <option key={file.filename} value={file.filename}>
                    {file.filename} ({(file.size / 1024).toFixed(1)} KB - Modified: {new Date(file.modified_time * 1000).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          </TabsContent>

          <TabsContent value="research" className="mt-4">
            {/* Category Selection for Research Tab */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select a category:
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategorySelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a category...</option>
                {RESEARCH_CATEGORIES.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name.charAt(0).toUpperCase() + category.name.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading results...</p>
          </div>
        )}

        {/* Results Display */}
        {results.length > 0 && (
          <div className="space-y-6">
            {/* Pagination Info */}
            {pagination && (
              <div className="space-y-4">
                {/* Results count and sorting info - centered */}
                <div className="text-center">
                  <p className="text-sm text-gray-700">
                    Showing {((pagination.current_page - 1) * pagination.items_per_page) + 1} to{' '}
                    {Math.min(pagination.current_page * pagination.items_per_page, pagination.total_items)} of{' '}
                    {pagination.total_items} results
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    📊 Sorted by highest Final Direct Score
                  </p>
                </div>

                {/* Pagination controls - centered */}
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.current_page === 1}
                    className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    First
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!pagination.has_previous}
                    className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(
                      pagination.total_pages - 4,
                      pagination.current_page - 2
                    )) + i;

                    if (pageNum > pagination.total_pages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-2 border rounded ${pageNum === pagination.current_page
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!pagination.has_next}
                    className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.total_pages)}
                    disabled={pagination.current_page === pagination.total_pages}
                    className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}

            {/* Posts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((result, index) => {
                const postInfo = getPostInfo(result.post_id);
                const metadata = postMetadata[result.post_id?.toString()];
                // Calculate the rank number based on current page and index
                const rankNumber = pagination ? ((pagination.current_page - 1) * pagination.items_per_page) + index + 1 : index + 1;

                return (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col h-full">
                    {/* Post Images */}
                    {postInfo && postInfo.image_files.length > 0 && (
                      <div className="aspect-square bg-gray-100 relative">
                        <img
                          src={getImageUrl(postInfo.image_files[0])}
                          alt={`Post by ${postInfo.username}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5YTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+'
                          }}
                        />
                        {/* Rank Number */}
                        <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                          #{rankNumber}
                        </div>
                        {/* Multi-image indicator */}
                        {postInfo.image_files.length > 1 && (
                          <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded-full text-xs font-medium">
                            📷 {postInfo.image_files.length}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Post Info - Flex container to push button to bottom */}
                    <div className="p-4 flex flex-col flex-grow">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">@{postInfo?.username || result.username}</h3>
                        <span className="text-xs text-gray-500">ID: {result.post_id}</span>
                      </div>

                      {/* Engagement Stats - Moved to top */}
                      {metadata && (
                        <div className="flex justify-between items-center rounded-lg py-2 mb-3">
                          <div className="flex items-center space-x-4">
                            <span className="text-sm font-medium text-gray-700">
                              ❤️ {metadata.likes?.toLocaleString() || '0'}
                            </span>
                            <span className="text-sm font-medium text-gray-700">
                              💬 {metadata.comments?.toLocaleString() || '0'}
                            </span>
                          </div>
                          {/* <span className="text-xs text-gray-500">Engagement</span> */}
                        </div>
                      )}

                      {/* Caption - More prominent display */}
                      {metadata?.caption && (
                        <div className="mb-3 flex-grow">
                          <p className="text-sm text-gray-800 leading-relaxed">
                            {truncateCaption(metadata.caption)}
                          </p>
                        </div>
                      )}

                      {/* Detail Button - Always at bottom */}
                      <div className="mt-auto">
                        <button
                          onClick={() => openPostDetail(result, postInfo, metadata)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center space-x-2 pt-6">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={pagination.current_page === 1}
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  First
                </button>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.has_previous}
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(
                    pagination.total_pages - 4,
                    pagination.current_page - 2
                  )) + i;

                  if (pageNum > pagination.total_pages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-2 border rounded ${pageNum === pagination.current_page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.has_next}
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
                <button
                  onClick={() => handlePageChange(pagination.total_pages)}
                  disabled={pagination.current_page === pagination.total_pages}
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Last
                </button>
              </div>
            )}
          </div>
        )}

        {selectedFile && !loading && results.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No results found for this file.
          </div>
        )}
      </div>

      {/* Post Detail Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && closePostDetail()}>
        <DialogContent className="w-[100vw] h-[100vh] max-w-none sm:max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Details</DialogTitle>
            <DialogDescription>
              Complete post information with all scores and full caption
            </DialogDescription>
          </DialogHeader>

          {selectedPost && (
            <div className="space-y-6">
              {/* Top Section - Image Gallery and Content */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 space-y-4">
                  {/* Image Gallery */}
                  {selectedPost.postInfo && selectedPost.postInfo.image_files.length > 0 && (
                    <div className="space-y-4">
                      {/* Main Image Display */}
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
                        <img
                          src={getImageUrl(selectedPost.postInfo.image_files[selectedPost.currentImageIndex || 0])}
                          alt={`Post by ${selectedPost.postInfo.username} - Image ${(selectedPost.currentImageIndex || 0) + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5YTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+'
                          }}
                        />

                        {/* Image Counter */}
                        {selectedPost.postInfo.image_files.length > 1 && (
                          <div className="absolute top-3 right-3 bg-black bg-opacity-60 text-white px-2 py-1 rounded-full text-xs">
                            {(selectedPost.currentImageIndex || 0) + 1} / {selectedPost.postInfo.image_files.length}
                          </div>
                        )}

                        {/* Navigation Arrows */}
                        {selectedPost.postInfo.image_files.length > 1 && (
                          <>
                            <button
                              onClick={() => {
                                const currentIndex = selectedPost.currentImageIndex || 0;
                                const newIndex = currentIndex > 0 ? currentIndex - 1 : selectedPost.postInfo!.image_files.length - 1;
                                setSelectedPost({ ...selectedPost, currentImageIndex: newIndex });
                              }}
                              className="absolute left-3 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white p-2 rounded-full transition-all"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => {
                                const currentIndex = selectedPost.currentImageIndex || 0;
                                const newIndex = currentIndex < selectedPost.postInfo!.image_files.length - 1 ? currentIndex + 1 : 0;
                                setSelectedPost({ ...selectedPost, currentImageIndex: newIndex });
                              }}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white p-2 rounded-full transition-all"
                            >
                              →
                            </button>
                          </>
                        )}
                      </div>

                      {/* Image Thumbnails */}
                      {selectedPost.postInfo.image_files.length > 1 && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex space-x-2 overflow-x-auto pb-2">
                            {selectedPost.postInfo.image_files.map((imageFile, index) => (
                              <button
                                key={index}
                                onClick={() => setSelectedPost({ ...selectedPost, currentImageIndex: index })}
                                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${(selectedPost.currentImageIndex || 0) === index
                                  ? 'border-blue-500 ring-2 ring-blue-200'
                                  : 'border-gray-200 hover:border-gray-300'
                                  }`}
                              >
                                <img
                                  src={getImageUrl(imageFile)}
                                  alt={`Thumbnail ${index + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiM5OWEzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5OL0E8L3RleHQ+PC9zdmc+'
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-9 space-y-4">
                {/* Post ID, Username and Rank */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-sm text-gray-500">Post ID: {selectedPost.result.post_id}</div>
                    <div className="font-bold">@{selectedPost.result.username}</div>
                  </div>
                  <span className="text-sm font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                    Rank #{selectedPost.rank !== null && selectedPost.rank !== undefined ? selectedPost.rank + 1 : 'N/A'}
                  </span>
                </div>



                {/* Engagement Stats */}
                {selectedPost.metadata && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-sm text-gray-600">Likes</span>
                        <p className="text-lg font-semibold text-gray-900">
                          ❤️ {selectedPost.metadata.likes?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Comments</span>
                        <p className="text-lg font-semibold text-gray-900">
                          💬 {selectedPost.metadata.comments?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Followers</span>
                        <p className="text-lg font-semibold text-gray-900">
                          👥 {selectedPost.result.followers?.toLocaleString() || '0'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Caption */}
                {selectedPost.metadata?.caption && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Caption</h3>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {selectedPost.metadata.caption}
                    </p>
                  </div>
                )}
              </div>
            </div>

        {/* All Scores - Full Width, 5 Columns */}
          <div className="bg-gray-50 rounded-lg p-4 w-full">
            <h3 className="font-semibold text-gray-900 mb-3">Scores</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-0 divide-x divide-gray-400">
              {/* Column 1 */}
              <div className="space-y-2 px-4 first:pl-0 last:pr-0">
                {['engagement_rate', 'log_engagement'].map((key) => (
                  selectedPost.result[key] && (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                        {formatScore(selectedPost.result[key])}
                      </span>
                    </div>
                  )
                ))}
              </div>
              {/* Column 2 */}
              <div className="space-y-2 px-4 first:pl-0 last:pr-0">
                {['image_caption_similarity', 'image_brand_similarity'].map((key) => (
                  selectedPost.result[key] && (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                        {formatScore(selectedPost.result[key])}
                      </span>
                    </div>
                  )
                ))}
              </div>
              {/* Column 3 */}
              <div className="space-y-2 px-4 first:pl-0 last:pr-0">
                {['caption_brand_similarity', 'direct_combined_similarity'].map((key) => (
                  selectedPost.result[key] && (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                        {formatScore(selectedPost.result[key])}
                      </span>
                    </div>
                  )
                ))}
              </div>
              {/* Column 4 */}
              <div className="space-y-2 px-4 first:pl-0 last:pr-0">
                {['coherence_weighted_similarity', 'normalized_engagement'].map((key) => (
                  selectedPost.result[key] && (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                        {formatScore(selectedPost.result[key])}
                      </span>
                    </div>
                  )
                ))}
              </div>
              {/* Column 5 */}
              <div className="space-y-2 px-4 first:pl-0 last:pr-0">
                {['final_coherence_score', 'final_direct_score'].map((key) => (
                  selectedPost.result[key] && (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-mono text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                        {formatScore(selectedPost.result[key])}
                      </span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
        )
}
      </DialogContent >
    </Dialog >
    </div >
  );
}