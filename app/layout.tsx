export const metadata = {
    title: "Диспетчер перевозок",
    description: "Поиск маршрутов, водителей и статистика",
  };
  
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="ru">
        <body className="min-h-screen bg-gray-50">
          {children}
        </body>
      </html>
    );
  }
  